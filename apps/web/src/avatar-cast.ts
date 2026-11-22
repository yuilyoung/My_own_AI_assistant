export const avatarNames = {
  seorin: "서린",
  hana: "하나",
  isol: "이솔",
} as const;

export type AvatarCharacter = keyof typeof avatarNames;
