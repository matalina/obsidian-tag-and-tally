import type { SvgNode } from "./svg-adapter";
import { Point, Orientation } from "./orientation";

export class Spline {
    types!: string;
    label!: string;
    side!: string;
    start!: string;
    id!: string;
    points: Point[];
    orientation!: Orientation;

    constructor() {
        this.points = [];
    }

    addPoint(x: string, y: string) {
        const nX = parseInt(x);
        const nY = parseInt(y);
        this.points.push(new Point(nX, nY));
    }

    computeMissingPoints(): Point[] {
        let i = 0;
        let current = this.points[i++];
        const result = [current];
        while (i < this.points.length) {
            current = this.oneStep(current, this.points[i]);
            result.push(current);
            if (
                current.x == this.points[i].x &&
                current.y == this.points[i].y
            ) {
                i++;
            }
        }
        return result;
    }

    oneStep(from: Point, to: Point): Point {
        let delta;
        const evenOdd = this.orientation.swapEvenOdd ? 1 : 0;

        if (this.orientation.flatTop) {
            delta = [
                [
                    new Point(-1, 0 - evenOdd),
                    new Point(0, -1),
                    new Point(+1, 0 - evenOdd),
                    new Point(+1, +1 - evenOdd),
                    new Point(0, +1),
                    new Point(-1, +1 - evenOdd),
                ],
                [
                    new Point(-1, -1 + evenOdd),
                    new Point(0, -1),
                    new Point(+1, -1 + evenOdd),
                    new Point(+1, 0 + evenOdd),
                    new Point(0, +1),
                    new Point(-1, 0 + evenOdd),
                ],
            ];
        } else {
            delta = [
                [
                    new Point(0 - evenOdd, -1),
                    new Point(1 - evenOdd, -1),
                    new Point(+1, 0),
                    new Point(+1 - evenOdd, +1),
                    new Point(0 - evenOdd, +1),
                    new Point(-1, 0),
                ],
                [
                    new Point(-1 + evenOdd, -1),
                    new Point(0 + evenOdd, -1),
                    new Point(+1, 0),
                    new Point(0 + evenOdd, +1),
                    new Point(-1 + evenOdd, +1),
                    new Point(-1, 0),
                ],
            ];
        }

        let min: number | undefined, best: Point | undefined;

        for (let i = 0; i < 6; i++) {
            let offset;
            if (this.orientation.flatTop) {
                offset = Math.abs(from.x % 2);
            } else {
                offset = Math.abs(from.y % 2);
            }

            const x = from.x + delta[offset][i].x;
            const y = from.y + delta[offset][i].y;
            const d = (to.x - x) * (to.x - x) + (to.y - y) * (to.y - y);
            if (min === undefined || d < min) {
                min = d;
                best = new Point(x, y);
            }
        }

        return best!;
    }

    partway(from: Point, to: Point, lerp = 1): Point {
        const pix1 = this.orientation.pixels(from);
        const pix2 = this.orientation.pixels(to);
        return new Point(
            pix1.x + (pix2.x - pix1.x) * lerp,
            pix1.y + (pix2.y - pix1.y) * lerp
        );
    }

    svg(svgEl: SvgNode, orientation: any, pathAttributes: any): void {
        this.orientation = orientation;
        const points = this.computeMissingPoints();
        let closed = false;
        if (points.length == 0) {
            return;
        }

        if (points[0].eq(points[points.length - 1])) {
            closed = true;
        }

        let path = "";

        if (closed) {
            for (let i = 0; i < points.length - 1; i++) {
                const current = points[i];
                const next = points[i + 1];
                if (path.length === 0) {
                    const a = this.partway(current, next, 0.3).toString();
                    const b = this.partway(current, next, 0.5).toString();
                    const c = this.partway(
                        points[points.length - 1],
                        current,
                        0.7
                    ).toString();
                    const d = this.partway(
                        points[points.length - 1],
                        current,
                        0.5
                    ).toString();
                    path += `M${d} C${c} ${a} ${b}`;
                } else {
                    const b = this.partway(current, next, 0.5).toString();
                    const a = this.partway(current, next, 0.3).toString();
                    path += ` S${a} ${b}`;
                }
            }
        } else {
            let current: Point | undefined, next: Point | undefined;
            for (let i = 0; i < points.length - 1; i++) {
                current = points[i];
                next = points[i + 1];
                if (path.length === 0) {
                    const a = this.partway(current, next, 0.3).toString();
                    const b = this.partway(current, next, 0.5).toString();
                    path += `M${a} C${b} ${a} ${b}`;
                } else {
                    const a = this.partway(current, next, 0.3).toString();
                    const b = this.partway(current, next, 0.5).toString();
                    path += ` S${a} ${b}`;
                }
            }
            path += " L" + this.partway(current!, next!, 0.7).toString();
        }

        svgEl.createSvg("path", {
            attr: {
                id: this.id,
                type: this.types,
                ...pathAttributes[this.types],
                d: path,
            },
        });
    }

    svgLabel(
        svgEl: SvgNode,
        labelAttributes: any,
        glowAttributes: any
    ): void {
        if (this.label === undefined) {
            return;
        }
        const points = this.computeMissingPoints();
        const pathAttributes: any = {
            href: `#${this.id}`,
        };
        if (this.side !== undefined) {
            pathAttributes["side"] = this.side;
        } else if (
            points[1].x < points[0].x ||
            (points.length > 2 && points[2].x < points[0].x)
        ) {
            pathAttributes["side"] = "right";
        }
        if (this.start !== undefined) {
            pathAttributes["startOffset"] = this.start;
        }

        const gEl = svgEl.createSvg("g");
        const glowEl = gEl.createSvg("text", {
            attr: {
                ...labelAttributes,
                ...glowAttributes,
            },
        });
        const glowPathEl = glowEl.createSvg("textPath", {
            attr: pathAttributes,
        });
        glowPathEl.textContent = this.label;

        const labelEl = gEl.createSvg("text", { attr: labelAttributes });
        const labelPathEl = labelEl.createSvg("textPath", {
            attr: pathAttributes,
        });
        labelPathEl.textContent = this.label;
    }
}
