import { ImageOff, Images } from "lucide-react";

/**
 * A campaign's post in the campaign list (per the design):
 * - the post's image; on hover it blurs under a 50% orange veil reading
 *   前往貼文, and a click opens the post;
 * - an "any post" campaign: an orange tile reading 任何貼文;
 * - a campaign waiting for the next post: an orange tile reading 下一篇貼文;
 * - a post with no image (or one that failed to load): a grey tile reading
 *   貼文無圖片, still opening the post when it has a link.
 */
export default function PostThumbnail({
  thumb,
  postUrl,
  anyPost,
  nextPost,
  alt,
}: {
  thumb?: string;
  postUrl: string | null;
  anyPost: boolean;
  nextPost: boolean;
  alt: string;
}) {
  const box = "relative flex size-28 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl text-base text-white sm:size-34";

  if (anyPost || nextPost) {
    return (
      <div className={`${box} bg-primary`}>
        <Images className="size-7" strokeWidth={1.5} />
        {anyPost ? "任何貼文" : "下一篇貼文"}
      </div>
    );
  }

  const content = thumb ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumb}
      alt={alt}
      className="absolute inset-0 size-full object-cover transition duration-200 group-hover:blur-[3px] group-focus-visible:blur-[3px]"
    />
  ) : (
    <>
      <ImageOff className="size-7" strokeWidth={1.5} />
      貼文無圖片
    </>
  );

  if (!postUrl) return <div className={`${box} bg-[#9e9e9e]`}>{content}</div>;

  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="前往貼文"
      className={`group ${box} bg-[#9e9e9e]`}
    >
      {content}
      <span className="absolute inset-0 flex items-center justify-center bg-[#FF6900]/50 font-bold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        前往貼文
      </span>
    </a>
  );
}
