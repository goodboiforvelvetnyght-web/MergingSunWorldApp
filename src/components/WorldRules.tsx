import {
  DEFAULT_TRAVEL_RULES,
  DEFAULT_SAILING_COST,
  TERRAIN_TYPES,
  FEATURE_TYPES,
  travelRulesError,
  type TravelRules,
  type TravelRule,
} from "../../shared/travelRules";

export function WorldRulesEditor({
  rules,
  onChange,
}: {
  rules: TravelRules;
  onChange: (rules: TravelRules) => void;
}) {
  const error = travelRulesError(rules);
  function update(
    group: "terrain" | "features",
    id: string,
    patch: Partial<TravelRule>,
  ) {
    const next = structuredClone(rules);
    const rows = next[group] as Record<string, TravelRule>;
    rows[id] = { ...rows[id], ...patch };
    onChange(next);
  }
  return (
    <article className="world-rules-page" aria-label="World Rules">
      <header>
        <div>
          <span className="eyebrow">WORLD RULES</span>
          <h1>Travel costs</h1>
          <p>
            Set the cost of entering a hex. Save a draft to keep working, then
            publish to apply these rules to everyone.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => onChange(structuredClone(DEFAULT_TRAVEL_RULES))}
        >
          Restore defaults
        </button>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <label className="sailing-cost-setting">
        Ship travel · flat energy per journey
        <input
          aria-label="Sailing energy cost"
          type="number"
          min={1}
          max={100}
          step={1}
          value={
            Number.isFinite(rules.sailingCost ?? DEFAULT_SAILING_COST)
              ? (rules.sailingCost ?? DEFAULT_SAILING_COST)
              : ""
          }
          onChange={(e) =>
            onChange({ ...rules, sailingCost: e.currentTarget.valueAsNumber })
          }
        />
        <small>
          Default 10 energy. Any harbour to any other harbour, regardless of
          distance. Arrival is inside the destination city.
        </small>
      </label>
      <div className="rules-table-scroll">
        <table className="rules-table">
          <thead>
            <tr>
              <th scope="col">Definition</th>
              <th scope="col">Energy on entry</th>
              <th scope="col">Walking</th>
              <th scope="col">Road effect</th>
            </tr>
          </thead>
          {(
            [
              ["terrain", TERRAIN_TYPES, "Base terrain"],
              ["features", FEATURE_TYPES, "Terrain features"],
            ] as const
          ).map(([group, ids, label]) => (
            <tbody key={group}>
              <tr className="rules-group">
                <th colSpan={4} scope="colgroup">
                  {label}
                  <small>
                    {group === "terrain"
                      ? "One per hex · costs 1–100"
                      : "Additive · costs 0–100 · hills and mountains are mutually exclusive"}
                  </small>
                </th>
              </tr>
              {ids.map((id) => {
                const row = (rules[group] as Record<string, TravelRule>)[id];
                return (
                  <tr key={id}>
                    <th scope="row">{id}</th>
                    <td>
                      <input
                        aria-label={`${id} energy cost`}
                        type="number"
                        min={group === "terrain" ? 1 : 0}
                        max={100}
                        step={1}
                        value={Number.isFinite(row.cost) ? row.cost : ""}
                        onChange={(e) =>
                          update(group, id, {
                            cost: e.currentTarget.valueAsNumber,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${id} walking`}
                        value={row.walking}
                        onChange={(e) =>
                          update(group, id, {
                            walking: e.target.value as TravelRule["walking"],
                          })
                        }
                      >
                        <option value="allowed">Allowed</option>
                        <option value="blocked">Blocked</option>
                        <option value="road-required">Requires road</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`${id} road effect`}
                        value={row.road}
                        onChange={(e) =>
                          update(group, id, {
                            road: e.target.value as TravelRule["road"],
                          })
                        }
                      >
                        <option value="discount">50% discount</option>
                        <option value="none">No discount on this cost</option>
                        <option value="passage-only">
                          No discount on entire hex
                        </option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <div className="rules-explanation">
        <h2>How costs combine</h2>
        <p>
          Add the base terrain and each feature. A road halves eligible costs.
          “No discount on entire hex” overrides all discounts on that hex; by
          default this is used for mountains. A blocked terrain or feature
          always blocks walking, including on roads.
        </p>
        <p>
          The starting hex is free. Travel follows the least-energy path and
          rounds the final journey total up once. Publishing costs does not move
          characters or spend their energy. Starting cities must remain
          walkable, and publishing cannot newly block an occupied hex.
        </p>
        <p>
          Default examples: plains 2 · forest on plains 4 · road through forest
          on plains 2 · the same road with a river 5 · mountain road on plains
          20.
        </p>
      </div>
    </article>
  );
}
