const MEMBER_AVATAR_TONES = [
  { bg: "#dce9ff", shadow: "rgb(27 112 245 / 18%)" },
  { bg: "#ffe2c5", shadow: "rgb(184 130 48 / 18%)" },
  { bg: "#c9f2e7", shadow: "rgb(14 157 103 / 18%)" },
  { bg: "#dbd2ff", shadow: "rgb(107 92 231 / 18%)" },
  { bg: "#ffd6e7", shadow: "rgb(219 68 120 / 18%)" },
  { bg: "#d7f0ff", shadow: "rgb(36 148 198 / 18%)" }
] as const;

export function memberDisplayName(
  name: string | null | undefined,
  email: string
): string {
  return name?.trim() || email;
}

export function memberAvatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 9973;
  }
  return MEMBER_AVATAR_TONES[hash % MEMBER_AVATAR_TONES.length];
}
