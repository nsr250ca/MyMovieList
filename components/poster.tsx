import Image from "next/image";
import { Film } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

export function Poster({ path, title }: { path?: string | null; title: string }) {
  const src = posterUrl(path);

  if (!src) {
    return (
      <div className="poster-placeholder" aria-label={`No poster for ${title}`}>
        <Film size={18} />
      </div>
    );
  }

  return <Image className="poster" src={src} alt={`${title} poster`} width={92} height={136} />;
}
