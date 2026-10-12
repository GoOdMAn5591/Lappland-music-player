import { useId } from "react";
import { glassIconPath, glassLiquidPath } from "../../app/glassProfiles";
import type { DrinkRecipe } from "../../app/recipes";

/** Small line drawing of a recipe's glass, filled with its drink colour. */
export function GlassIcon({
  recipe,
  size = 22,
  level,
}: {
  recipe: DrinkRecipe;
  size?: number;
  level?: number;
}) {
  const id = useId();
  return (
    <svg
      className="glass-icon"
      viewBox="0 0 24 32"
      width={size}
      height={(size * 32) / 24}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-liquid`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={recipe.palette.top} />
          <stop offset="1" stopColor={recipe.palette.deep} />
        </linearGradient>
      </defs>
      <path
        d={glassLiquidPath(recipe.shape, level ?? recipe.level)}
        fill={`url(#${id}-liquid)`}
      />
      <path d={glassIconPath(recipe.shape)} className="glass-icon-outline" />
    </svg>
  );
}
