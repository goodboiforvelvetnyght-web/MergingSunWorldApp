import { useState } from "react";
import { coverUrl } from "../../shared/assets";
import type { Location } from "../../shared/world";
export function SettlementCover({
  location,
}: {
  location: Pick<Location, "coverAssetId" | "coverPosition" | "name">;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="settlement-cover">
      {location.coverAssetId && failed !== location.coverAssetId ? (
        <img
          src={coverUrl(location.coverAssetId)}
          alt={`${location.name} cover`}
          style={{ objectPosition: `50% ${location.coverPosition ?? 50}%` }}
          onError={() => setFailed(location.coverAssetId!)}
        />
      ) : (
        <>
          <div className="detail-sun" />
          <div className="detail-hills" />
        </>
      )}
    </div>
  );
}
