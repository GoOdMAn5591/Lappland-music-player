import type { CSSProperties } from "react";

const colors = [
  "#886126",
  "#356055",
  "#975029",
  "#6b2634",
  "#b99c55",
  "#647567",
];

export function BottleWall() {
  return (
    <div className="bottle-wall" aria-hidden="true">
      <div className="backbar-sign">
        <span>NOCTURNE</span>
        <small>PRIVATE RESERVE / 00:00</small>
      </div>
      <div className="cabinet-bank">
        {Array.from({ length: 4 }, (_, cabinet) => (
          <div className={`bottle-cabinet cabinet-${cabinet}`} key={cabinet}>
            <div className="cabinet-crown">
              <span>
                {["APERITIVO", "VINI ROSSI", "RISERVA", "AMARO"][cabinet]}
              </span>
            </div>
            {Array.from({ length: 3 }, (_, row) => (
              <div className="bottle-shelf" key={row}>
                {Array.from({ length: 6 }, (_, column) => {
                  const index = cabinet * 18 + row * 6 + column;
                  return (
                    <div
                      className={`shelf-bottle bottle-form-${index % 4}`}
                      key={column}
                      style={
                        {
                          "--bottle-color": colors[index % colors.length],
                          "--bottle-height": `${48 + ((index * 13) % 34)}px`,
                          "--bottle-width": `${17 + ((index * 7) % 12)}px`,
                        } as CSSProperties
                      }
                    >
                      <i className="bottle-neck" />
                      <i className="bottle-shoulder" />
                      <i className="bottle-label">
                        <b>{["N", "R", "V", "X"][index % 4]}</b>
                        <small>{1900 + ((index * 7) % 99)}</small>
                      </i>
                    </div>
                  );
                })}
                <i className="shelf-light" />
              </div>
            ))}
            <div className="stemware-rack">
              {Array.from({ length: 5 }, (_, i) => (
                <span className="hanging-glass" key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="wall-sconce sconce-left">
        <i />
      </div>
      <div className="wall-sconce sconce-right">
        <i />
      </div>
    </div>
  );
}
