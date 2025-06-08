/*global BigInt*/
import React from "react";
import { deckToIndex, indexToDeck } from "../lib/deckTools";
import { MAX_UUID } from "../lib/constants";
const PADDING_SENTINEL = "X";
const VARIANT_SENTINEL = "V";
const VERSION = "4";
const VALID_VARIANTS = ["8", "9", "a", "b"];

function getPatternWithPadding(search, leftPadding) {
  const uuidTemplate = `${PADDING_SENTINEL.repeat(8)}-${PADDING_SENTINEL.repeat(4)}-${VERSION}${PADDING_SENTINEL.repeat(3)}-${VARIANT_SENTINEL}${PADDING_SENTINEL.repeat(3)}-${PADDING_SENTINEL.repeat(12)}`;

  for (let pos = 0; pos < search.length; pos++) {
    const patternPos = leftPadding + pos;
    const inputChar = search[pos];
    const templateChar = uuidTemplate[patternPos];

    if (
      (inputChar === "-" && templateChar !== "-") ||
      (templateChar === "-" && inputChar !== "-")
    ) {
      return null;
    }

    if (patternPos === 14 && inputChar !== VERSION) {
      return null;
    }

    if (patternPos === 19 && !VALID_VARIANTS.includes(inputChar)) {
      return null;
    }
  }

  const pattern =
    uuidTemplate.slice(0, leftPadding) +
    search +
    uuidTemplate.slice(leftPadding + search.length);

  const sections = pattern.split("-");
  if (
    sections[0].length === 8 &&
    sections[1].length === 4 &&
    sections[2].length === 4 &&
    sections[3].length === 4 &&
    sections[4].length === 12
  ) {
    return pattern;
  }

  return null;
}

function getAllValidPatterns(search) {
  const patterns = [];
  const uuidTemplate = `${PADDING_SENTINEL.repeat(8)}-${PADDING_SENTINEL.repeat(4)}-${VERSION}${PADDING_SENTINEL.repeat(3)}-${VARIANT_SENTINEL}${PADDING_SENTINEL.repeat(3)}-${PADDING_SENTINEL.repeat(12)}`;

  for (
    let leftPadding = 0;
    leftPadding < uuidTemplate.length - search.length + 1;
    leftPadding++
  ) {
    const pattern = getPatternWithPadding(search, leftPadding);
    if (pattern) {
      patterns.push({ pattern, leftPadding });
    }
  }

  return patterns;
}

function generateRandomUUID(pattern) {
  return pattern
    .replace(
      new RegExp(VARIANT_SENTINEL, "g"),
      () => VALID_VARIANTS[Math.floor(Math.random() * VALID_VARIANTS.length)]
    )
    .replace(
      new RegExp(PADDING_SENTINEL, "g"),
      () => "0123456789abcdef"[Math.floor(Math.random() * 16)]
    );
}

const SEARCH_LOOKBACK = 50;
const SEARCH_LOOKAHEAD = 25;
const RANDOM_SEARCH_ITERATIONS = 100;

export function useUUIDSearch({ virtualPosition, displayedUUIDs }) {
  const [search, setSearch] = React.useState(null);
  const [uuid, setUUID] = React.useState(null);
  // Stack of complete states we've seen
  const [nextStates, setNextStates] = React.useState([]);

  const previousUUIDs = React.useMemo(() => {
    let hasComputed = false;
    let value = null;
    const getValue = () => {
      const compute = () => {
        const prev = [];
        for (let i = 1; i <= SEARCH_LOOKBACK; i++) {
          i = BigInt(i);
          let index = BigInt(virtualPosition) - i;
          if (index < 0n) {
            index = MAX_UUID + index;
          }
          const uuid = indexToDeck(index);
          prev.push({ index, uuid });
        }
        return prev;
      };
      if (!hasComputed) {
        value = compute();
        hasComputed = true;
      }
      return value;
    };
    return getValue;
  }, [virtualPosition]);

  const nextUUIDs = React.useMemo(() => {
    let hasComputed = false;
    let value = null;
    const getValue = () => {
      const compute = () => {
        const next = [];
        for (let i = 1; i <= SEARCH_LOOKAHEAD; i++) {
          i = BigInt(i);
          let index = virtualPosition + i;
          if (index > MAX_UUID) {
            index = index - MAX_UUID;
          }
          const uuid = indexToDeck(index);
          next.push({ index, uuid });
        }
        return next;
      };
      if (!hasComputed) {
        value = compute();
        hasComputed = true;
      }
      return value;
    };
    return getValue;
  }, [virtualPosition]);

  const searchAround = React.useCallback(
    ({ input, wantHigher, canUseCurrentIndex }) => {
      if (wantHigher) {
        const startPosition = canUseCurrentIndex ? 0 : 1;
        for (let i = startPosition; i < displayedUUIDs.length; i++) {
          const uuid = displayedUUIDs[i].uuid;
          if (uuid.includes(input)) {
            return { uuid, index: displayedUUIDs[i].index };
          }
        }
        const next = nextUUIDs();
        for (let i = 0; i < next.length; i++) {
          const uuid = next[i].uuid;
          if (uuid.includes(input)) {
            return { uuid, index: nextUUIDs[i].index };
          }
        }
      } else {
        // canUseCurrentIndex isn't relevant when searching backwards!
        const prev = previousUUIDs();
        for (const { uuid, index } of prev) {
          if (uuid.includes(input)) {
            return { uuid, index };
          }
        }
      }
      return null;
    },
    [displayedUUIDs, previousUUIDs, nextUUIDs]
  );

  const searchRandomly = React.useCallback(
    ({ input, wantHigher }) => {
      const patterns = getAllValidPatterns(input);
      if (patterns.length === 0) return null;
      let best = null;
      let compareIndex = virtualPosition;
      for (let i = 0; i < RANDOM_SEARCH_ITERATIONS; i++) {
        const { pattern, leftPadding } =
          patterns[Math.floor(Math.random() * patterns.length)];
        const uuid = generateRandomUUID(pattern);
        const index = deckToIndex(uuid);
        const satisfiesConstraint = wantHigher
          ? index > compareIndex
          : index < compareIndex;
        const notInHistory = !nextStates.some(
          ({ uuid: nextUUID }) => nextUUID === uuid
        );
        if (satisfiesConstraint && notInHistory) {
          const isBetter =
            best === null
              ? true
              : wantHigher
                ? index < best.index
                : index > best.index;
          if (isBetter) {
            best = { uuid, pattern, leftPadding, index };
          }
        }
      }
      if (best) {
        return best;
      }
      const { pattern: fallbackPattern, leftPadding: fallbackLeftPadding } =
        patterns[Math.floor(Math.random() * patterns.length)];
      return {
        uuid: generateRandomUUID(fallbackPattern),
        pattern: fallbackPattern,
        leftPadding: fallbackLeftPadding,
        index: deckToIndex(uuid),
      };
    },
    [nextStates, uuid, virtualPosition]
  );

  const searchUUID = React.useCallback(
    (input) => {
      const invalid = input.toLowerCase().replace(/[^0-9a-f-]/g, "");
      if (invalid !== input) {
        return null;
      }
      const newSearch = input.toLowerCase().replace(/[^0-9a-f-]/g, "");
      if (!newSearch) return null;

      // Clear next states stack when search changes
      setNextStates([]);

      const inner = () => {
        const around = searchAround({
          input,
          wantHigher: true,
          canUseCurrentIndex: true,
        });
        if (around) return around;
        return searchRandomly({ input, wantHigher: true });
      };

      const result = inner();
      if (result) {
        setSearch(newSearch);
        setUUID(result.uuid);
        setNextStates((prev) => [...prev, result]);
      }
      return result?.uuid ?? null;
    },
    [searchAround, searchRandomly]
  );

  const nextUUID = React.useCallback(() => {
    if (!uuid || !search) return null;
    const inner = () => {
      const around = searchAround({
        input: search,
        wantHigher: true,
        canUseCurrentIndex: false,
      });
      if (around) return around;
      return searchRandomly({ input: search, wantHigher: true });
    };
    const result = inner();
    if (result) {
      setUUID(result.uuid);
      setNextStates((prev) => [...prev, result]);
      return result.uuid;
    }
    return null;
  }, [uuid, search, searchAround, searchRandomly]);

  const previousUUID = React.useCallback(() => {
    if (!uuid || !search) return null;

    if (nextStates.length > 1) {
      setNextStates((prev) => prev.slice(0, -1));
      const prevState = nextStates[nextStates.length - 2];
      setUUID(prevState.uuid);
      return prevState.uuid;
    }

    const inner = () => {
      const around = searchAround({
        input: search,
        wantHigher: false,
        canUseCurrentIndex: false,
      });
      if (around) return around;
      return searchRandomly({ input: search, wantHigher: false });
    };
    const result = inner();
    if (result) {
      setUUID(result.uuid);
      return result.uuid;
    }
    return null;
  }, [uuid, search, nextStates, searchAround, searchRandomly]);

  return {
    searchUUID,
    nextUUID,
    previousUUID,
    currentUUID: uuid,
  };
}
