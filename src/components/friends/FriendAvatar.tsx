const SIZES = { sm: "h-9 w-9", md: "h-11 w-11" } as const;

export default function FriendAvatar({
  image,
  size = "sm",
}: {
  image?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} shrink-0 rounded-full border border-line object-cover`}
      />
    );
  }
  return <span className={`${SIZES[size]} shrink-0 rounded-full border border-line bg-surface-2`} />;
}
