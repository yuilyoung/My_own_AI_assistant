export const avatarNames = {
  seorin: "서린",
  hana: "하나",
  isol: "이솔",
} as const;

export type AvatarCharacter = keyof typeof avatarNames;

export function characterForMode(
  character: AvatarCharacter,
  mode: "assistant" | "companion",
): AvatarCharacter {
  return mode === "companion" && character === "hana" ? "seorin" : character;
}
