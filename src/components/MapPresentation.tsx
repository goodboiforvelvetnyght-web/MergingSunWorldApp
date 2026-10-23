import { useState } from "react";
import {
  DEFAULT_MAP_PRESENTATION,
  ICON_CATEGORIES,
  mapPresentationError,
  type MapPresentation,
  type IconStyle,
} from "../../shared/mapPresentation";
export function MapPresentationEditor({
  settings,
  onChange,
  onPreview,
  onHome,
}: {
  settings: MapPresentation;
  onChange: (p: MapPresentation) => void;
  onPreview: (z: number) => void;
  onHome: () => void;
}) {
  const [previewZoom, setPreviewZoom] = useState(settings.defaultZoom);
  const error = mapPresentationError(settings);
  const number = (
    label: string,
    value: number,
    update: (n: number) => void,
    min = -4,
    max = 7,
    step = 0.25,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => update(e.currentTarget.valueAsNumber)}
      />
    </label>
  );
  const iconNumber = (
    id: (typeof ICON_CATEGORIES)[number],
    field: keyof IconStyle,
    label: string,
    size = false,
  ) =>
    number(
      `${id} ${label}`,
      settings.icons[id][field] as number,
      (n) =>
        onChange({
          ...settings,
          icons: {
            ...settings.icons,
            [id]: { ...settings.icons[id], [field]: n },
          },
        }),
      size ? 8 : -4,
      size ? 160 : 7,
      size ? 1 : 0.25,
    );
  return (
    <section
      className="presentation-settings"
      aria-label="Map presentation settings"
    >
      <h2>Map presentation</h2>
      <p>
        Preview player appearance live on the map. Sizes are screen pixels at
        zoom 2. Gradual scaling grows gently with zoom. Save a draft, then
        publish for everyone.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {number("Minimum zoom", settings.minZoom, (n) =>
        onChange({ ...settings, minZoom: n }),
      )}
      {number("Maximum zoom", settings.maxZoom, (n) =>
        onChange({ ...settings, maxZoom: n }),
      )}
      {number("Default zoom", settings.defaultZoom, (n) =>
        onChange({ ...settings, defaultZoom: n }),
      )}
      <label>
        Starting view
        <select
          aria-label="Starting view"
          value={settings.startView}
          onChange={(e) =>
            onChange({
              ...settings,
              startView: e.target.value as MapPresentation["startView"],
            })
          }
        >
          <option value="fit">Fit whole world to screen</option>
          <option value="default">Default zoom at world center</option>
        </select>
      </label>
      <button className="button secondary" disabled={!!error} onClick={onHome}>
        Preview starting view
      </button>
      {number("Preview zoom", previewZoom, (z) => {
        setPreviewZoom(z);
        onPreview(z);
      })}
      {ICON_CATEGORIES.map((id) => (
        <fieldset key={id}>
          <legend>
            {id === "kingdom"
              ? "Kingdom emblems"
              : id === "character"
                ? "Your character"
                : id}
          </legend>
          {iconNumber(id, "size", "base size", true)}
          <label>
            Scale behavior
            <select
              aria-label={`${id} scale behavior`}
              value={settings.icons[id].scaling}
              onChange={(e) =>
                onChange({
                  ...settings,
                  icons: {
                    ...settings.icons,
                    [id]: {
                      ...settings.icons[id],
                      scaling: e.target.value as IconStyle["scaling"],
                    },
                  },
                })
              }
            >
              <option value="fixed">Fixed screen size</option>
              <option value="gradual">Gradual scaling</option>
            </select>
          </label>
          {iconNumber(id, "minSize", "minimum size", true)}
          {iconNumber(id, "maxSize", "maximum size", true)}
          {iconNumber(id, "minZoom", "visible from zoom")}
          {iconNumber(id, "maxZoom", "visible through zoom")}
          {iconNumber(id, "labelMinZoom", "label from zoom")}
          {iconNumber(id, "labelMaxZoom", "label through zoom")}
        </fieldset>
      ))}
      <button
        className="button secondary"
        onClick={() => onChange(structuredClone(DEFAULT_MAP_PRESENTATION))}
      >
        Restore presentation defaults
      </button>
      <p>
        Appearance settings do not affect map coordinates or travel costs. The
        normal editor keeps its full zoom range.
      </p>
    </section>
  );
}
