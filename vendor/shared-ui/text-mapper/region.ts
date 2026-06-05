import type { SvgNode } from "./svg-adapter";
import { Point, Orientation } from "./orientation";
import { NamespaceFunction } from "./constants";

export class Region {
    x!: number;
    y!: number;
    types: string[];
    label!: string;
    size!: string;
    id!: string;
    namespace: NamespaceFunction;

    constructor(namespace: NamespaceFunction) {
        this.types = [];
        this.namespace = namespace;
    }

    pixels(orientation: Orientation, addX: number, addY: number): number[] {
        const pix = orientation.pixels(new Point(this.x, this.y), addX, addY);
        return [pix.x, pix.y];
    }

    svg(svgEl: SvgNode, orientation: Orientation, types: string[]): void {
        const pix = orientation.pixels(new Point(this.x, this.y));
        for (const type of this.types) {
            if (!types.includes(type)) {
                continue;
            }
            const namespaced = this.namespace(type);
            svgEl.createSvg("use", {
                attr: {
                    x: pix.x.toFixed(1),
                    y: pix.y.toFixed(1),
                    href: `#${namespaced}`,
                },
            });
        }
    }

    svgCoordinates(
        svgEl: SvgNode,
        orientation: Orientation,
        textAttributes: any,
        coordinatesFormat: string
    ): void {
        const pix = orientation.pixels(
            new Point(this.x, this.y),
            0,
            -orientation.dy * orientation.labelOffset
        );

        const coordEl = svgEl.createSvg("text", {
            attr: {
                ...textAttributes,
                "text-anchor": "middle",
                x: pix.x.toFixed(1),
                y: pix.y.toFixed(1),
            },
        });

        const formatNumber = (num: number): string => {
            const absNum = Math.abs(num);
            const padded = absNum.toString().padStart(2, "0");
            return num < 0 ? `-${padded}` : padded;
        };

        const xStr = formatNumber(this.x);
        const yStr = formatNumber(this.y);

        const content = coordinatesFormat
            .replace("{X}", xStr)
            .replace("{Y}", yStr);

        coordEl.textContent = content;
    }

    svgRegion(
        svgEl: SvgNode,
        orientation: Orientation,
        attributes: any
    ): void {
        const points = orientation
            .hexCorners()
            .map((corner: Point) => {
                return orientation
                    .pixels(new Point(this.x, this.y), corner.x, corner.y)
                    .toString();
            })
            .join(" ");

        svgEl.createSvg("polygon", {
            attr: {
                ...attributes,
                id: this.namespace(this.id),
                points,
            },
        });
    }

    svgLabel(
        svgEl: SvgNode,
        orientation: Orientation,
        labelAttributes: any,
        glowAttributes: any
    ): void {
        if (this.label === undefined) {
            return;
        }
        const attributes = {
            ...labelAttributes,
        };

        const textContent =
            this.computeLinkAndLabel(this.label).length > 1
                ? this.computeLinkAndLabel(this.label)[1]
                : this.computeLinkAndLabel(this.label)[0];
        const linkContent = this.computeLinkAndLabel(this.label)[0];

        if (this.size !== undefined) {
            attributes["font-size"] = this.size;
        }
        const pix = orientation.pixels(
            new Point(this.x, this.y),
            0,
            orientation.dy * orientation.labelOffset
        );
        const gEl = svgEl.createSvg("g");

        const glowEl = gEl.createSvg("text", {
            attr: {
                "text-anchor": "middle",
                x: pix.x.toFixed(1),
                y: pix.y.toFixed(1),
                ...attributes,
                ...glowAttributes,
            },
        });
        glowEl.textContent = textContent;

        if (textContent !== linkContent) {
            const parsed = this.parseLinkTarget(linkContent);
            const linkAttrs: Record<string, string> = {
                "aria-label": linkContent,
            };
            if (parsed) {
                linkAttrs["data-link-type"] = parsed.type;
                linkAttrs["data-link-target"] = parsed.target;
                linkAttrs["href"] = "#";
            } else {
                linkAttrs["href"] = linkContent;
                linkAttrs["target"] = "_blank";
                linkAttrs["rel"] = "noopener";
            }

            const labelLinkEl = gEl.createSvg("a", { attr: linkAttrs });

            const labelEl = labelLinkEl.createSvg("text", {
                attr: {
                    "text-anchor": "middle",
                    x: pix.x.toFixed(1),
                    y: pix.y.toFixed(1),
                    ...attributes,
                },
            });

            labelEl.textContent = textContent;
        } else {
            const labelEl = gEl.createSvg("text", {
                attr: {
                    "text-anchor": "middle",
                    x: pix.x.toFixed(1),
                    y: pix.y.toFixed(1),
                    ...attributes,
                },
            });

            labelEl.textContent = textContent;
        }
    }

    parseLinkTarget(link: string): { type: string; target: string } | null {
        const match = link.match(/^(lore|journal|character|map):(.+)$/);
        if (!match) return null;
        return { type: match[1], target: match[2] };
    }

    computeLinkAndLabel(label: string): [string, string] {
        let link = label;
        let display = label;
        if (label.includes("|")) {
            const parts = label.split("|");
            link = parts[0];
            display = parts[1];
        }
        return [link, display];
    }
}
