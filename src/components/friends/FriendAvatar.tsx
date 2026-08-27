export default function FriendAvatar({ image }: { image?: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className="h-9 w-9 shrink-0 rounded-full border border-line"
      />
    );
  }
  return <span className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface-2" />;
}
