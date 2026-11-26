import { MotionAvatar, type MotionAvatarProps } from "./MotionAvatar";

export { MotionAvatar, type AvatarCharacter } from "./MotionAvatar";

export function SeorinAvatar(props: Omit<MotionAvatarProps, "character">) {
  return <MotionAvatar {...props} character="seorin" />;
}
