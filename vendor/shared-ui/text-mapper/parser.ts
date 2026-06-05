import {
    ATTRIBUTES_REGEX,
    PATH_ATTRIBUTES_REGEX,
    OPTION_REGEX,
    PATH_REGEX,
    XML_REGEX,
    TEXT_REGEX,
    GLOW_REGEX,
    LABEL_REGEX,
    HEX_REGEX,
    HEX_LABEL_REGEX,
    SPLINE_REGEX,
    SPLINE_ELEMENT_SPLIT_REGEX,
    SPLINE_POINT_REGEX,
    ATTRIBUTE_MAP_REGEX,
    SVG_CHOMP_WHITESPACE_REGEX,
    SVG_ID_REGEX,
    SVG_HREF_REGEX,
} from "./constants";
import type { SvgNode } from "./svg-adapter";
import { createSvgRoot } from "./svg-adapter";
import { Point, Orientation } from "./orientation";
import { Region } from "./region";
import { Spline } from "./spline";

/**
 * Get the 6 neighboring hex coordinates for a given hex.
 * Works with both flat-top and pointy-top (horizontal) hexes.
 */
export function getHexNeighbors(x: number, y: number, flatTop: boolean = true, swapEvenOdd: boolean = false): Array<{ x: number; y: number }> {
    const evenOdd = swapEvenOdd ? 1 : 0;

    if (flatTop) {
        const isEven = Math.abs(x) % 2 === 0;

        if (isEven) {
            return [
                { x: x + 0, y: y - 1 },
                { x: x + 1, y: y + 0 - evenOdd },
                { x: x + 1, y: y + 1 - evenOdd },
                { x: x + 0, y: y + 1 },
                { x: x - 1, y: y + 1 - evenOdd },
                { x: x - 1, y: y + 0 - evenOdd },
            ];
        } else {
            return [
                { x: x + 0, y: y - 1 },
                { x: x + 1, y: y - 1 + evenOdd },
                { x: x + 1, y: y + 0 + evenOdd },
                { x: x + 0, y: y + 1 },
                { x: x - 1, y: y + 0 + evenOdd },
                { x: x - 1, y: y - 1 + evenOdd },
            ];
        }
    } else {
        const isEven = Math.abs(y) % 2 === 0;

        if (isEven) {
            return [
                { x: x + 0 - evenOdd, y: y - 1 },
                { x: x + 1 - evenOdd, y: y - 1 },
                { x: x + 1, y: y + 0 },
                { x: x + 1 - evenOdd, y: y + 1 },
                { x: x + 0 - evenOdd, y: y + 1 },
                { x: x - 1, y: y + 0 },
            ];
        } else {
            return [
                { x: x - 1 + evenOdd, y: y - 1 },
                { x: x + 0 + evenOdd, y: y - 1 },
                { x: x + 1, y: y + 0 },
                { x: x + 0 + evenOdd, y: y + 1 },
                { x: x - 1 + evenOdd, y: y + 1 },
                { x: x - 1, y: y + 0 },
            ];
        }
    }
}

function getHexesInRings(centerX: number, centerY: number, rings: number, flatTop: boolean = true, swapEvenOdd: boolean = false): Set<string> {
    const hexes = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number; ring: number }> = [{ x: centerX, y: centerY, ring: 0 }];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.x},${current.y}`;

        if (visited.has(key)) continue;
        if (current.ring > rings) continue;

        visited.add(key);
        hexes.add(key);

        if (current.ring < rings) {
            const neighbors = getHexNeighbors(current.x, current.y, flatTop, swapEvenOdd);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                if (!visited.has(neighborKey)) {
                    queue.push({ x: neighbor.x, y: neighbor.y, ring: current.ring + 1 });
                }
            }
        }
    }

    return hexes;
}

export class TextMapperParser {
    id: string;
    pathId!: number;
    options: any;
    regions: Region[];
    attributes: any;
    defs: string[];
    path: any;
    splines: Spline[];
    pathAttributes: any;
    textAttributes: any;
    glowAttributes: any;
    labelAttributes: any;
    orientation!: Orientation;

    constructor(id: string) {
        this.id = id;
        this.options = {
            horizontal: false,
            "coordinates-format": "{X}{Y}",
            "swap-even-odd": false,
            global: false,
        };
        this.regions = [];
        this.attributes = {};
        this.defs = [];
        this.path = {};
        this.splines = [];
        this.pathAttributes = {};
        this.textAttributes = "";
        this.glowAttributes = "";
        this.labelAttributes = "";
    }

    private namespace(what: string) {
        if (this.options.global) {
            return `${what}`;
        }
        return `${what}-${this.id}`;
    }

    process(lines: string[]) {
        this.pathId = 0;

        for (const line of lines) {
            if (line.startsWith("#")) {
                continue;
            }
            if (OPTION_REGEX.test(line)) {
                const match = line.match(OPTION_REGEX);
                this.parseOption(match![1]);
            }
        }

        if (this.options.horizontal) {
            this.orientation = new Orientation(
                false,
                this.options["swap-even-odd"]
            );
        } else {
            this.orientation = new Orientation(
                true,
                this.options["swap-even-odd"]
            );
        }

        for (const line of lines) {
            if (line.startsWith("#")) {
                continue;
            }
            if (HEX_REGEX.test(line)) {
                const region = this.parseRegion(line);
                if (region) this.regions.push(region);
            } else if (SPLINE_REGEX.test(line)) {
                const spline = this.parsePath(line);
                this.splines.push(spline);
            } else if (ATTRIBUTES_REGEX.test(line)) {
                const match = line.match(ATTRIBUTES_REGEX);
                this.attributes[match![1]] = this.parseAttributes(match![2]);
            } else if (XML_REGEX.test(line)) {
                const match = line.match(XML_REGEX);
                this.def(match![1]);
            } else if (PATH_ATTRIBUTES_REGEX.test(line)) {
                const match = line.match(PATH_ATTRIBUTES_REGEX);
                this.pathAttributes[match![1]] = this.parseAttributes(match![2]);
            } else if (PATH_REGEX.test(line)) {
                const match = line.match(PATH_REGEX);
                this.path[match![1]] = match![2];
            } else if (TEXT_REGEX.test(line)) {
                const match = line.match(TEXT_REGEX);
                this.textAttributes = this.parseAttributes(match![1]);
            } else if (GLOW_REGEX.test(line)) {
                const match = line.match(GLOW_REGEX);
                this.glowAttributes = this.parseAttributes(match![1]);
            } else if (LABEL_REGEX.test(line)) {
                const match = line.match(LABEL_REGEX);
                this.labelAttributes = this.parseAttributes(match![1]);
            }
        }
    }

    parseRegion(line: string): Region | null {
        const match = line.match(HEX_REGEX);
        const region = this.makeRegion(match![1], match![2], match![3] || "00");
        if (!region) return null;
        let rest = match![4];
        while (HEX_LABEL_REGEX.test(rest)) {
            const labelMatch = rest.match(HEX_LABEL_REGEX);
            region.label = labelMatch![1];
            region.size = labelMatch![2];
            rest = rest.replace(HEX_LABEL_REGEX, "");
        }
        const types = rest.split(/\s+/).filter((t) => t.length > 0);
        region.types = types;
        return region;
    }

    parsePath(line: string) {
        const match = line.match(SPLINE_REGEX);
        const spline = this.makeSpline();
        spline.types = match![2];
        spline.label = match![3];
        spline.side = match![4];
        spline.start = match![5];

        let rest = line;
        // eslint-disable-next-line no-constant-condition -- segment scanner; exits via break when the line is consumed
        while (true) {
            let segment: string;
            [segment, rest] = this.splitPathSegments(rest);
            if (segment === null) {
                break;
            }
            const pointMatch = segment.match(SPLINE_POINT_REGEX);
            spline.addPoint(pointMatch![1], pointMatch![2]);
        }
        return spline;
    }

    private splitPathSegments(splinePath: string): [string, string] {
        const match = splinePath.match(SPLINE_ELEMENT_SPLIT_REGEX);
        if (match === null) {
            return [null as any, splinePath];
        }
        return [match[1], match[2]];
    }

    def(what: string) {
        let svg = what.replace(SVG_CHOMP_WHITESPACE_REGEX, "$1$3");
        let match;
        while ((match = SVG_ID_REGEX.exec(svg))) {
            svg = svg.replace(
                match[0],
                `${match[1]}${this.namespace(match[2])}${match[3]}`
            );
        }
        while ((match = SVG_HREF_REGEX.exec(svg))) {
            svg = svg.replace(
                match[0],
                `${match[1]}${this.namespace(match[2])}${match[3]}`
            );
        }
        this.defs.push(svg);
    }

    makeRegion(x: string, y: string, _z: string): Region | null {
        const px = parseInt(x);
        const py = parseInt(y);
        if (px < 0 || px > 99 || py < 0 || py > 99) return null;
        const region = new Region(this.namespace.bind(this));
        region.x = px;
        region.y = py;
        region.id = `hex.${region.x}.${region.y}`;
        return region;
    }

    makeSpline(): Spline {
        const spline = new Spline();
        this.pathId++;
        spline.id = this.namespace(`path-${this.pathId}`);
        return spline;
    }

    parseAttributes(attrs: string): any {
        const output: any = {};
        let matches;
        while ((matches = ATTRIBUTE_MAP_REGEX.exec(attrs))) {
            output[matches[1]] = matches[2];
        }
        return output;
    }

    parseOption(optionStr: string): any {
        const option: any = {
            valid: false,
            key: "",
            value: "",
        };

        const tokens = optionStr.split(" ");
        if (tokens.length < 1) {
            return option;
        }
        option.key = tokens[0];

        if (option.key === "horizontal" || option.key === "swap-even-odd") {
            option.valid = true;
            option.value = true;
        } else if (option.key === "coordinates-format") {
            option.valid = true;
            option.value = tokens.slice(1).join(" ");
        } else if (option.key === "global") {
            option.valid = true;
            option.value = true;
        } else if (option.key === "center-content") {
            option.valid = true;
            option.value = true;
        } else if (option.key === "zoom") {
            option.valid = true;
            if (tokens.length >= 2) {
                const zoomValue = parseFloat(tokens[1]);
                if (!isNaN(zoomValue) && zoomValue > 0) {
                    option.value = zoomValue;
                }
            }
        } else if (option.key === "centered-at") {
            option.valid = true;
            if (tokens.length >= 2) {
                const coordStr = tokens[1];
                if (coordStr.length === 4 && /^\d{4}$/.test(coordStr)) {
                    const x = parseInt(coordStr.substring(0, 2), 10);
                    const y = parseInt(coordStr.substring(2, 4), 10);
                    if (!isNaN(x) && !isNaN(y)) {
                        option.value = { x, y };
                    }
                } else if (tokens.length >= 3) {
                    const x = parseInt(tokens[1], 10);
                    const y = parseInt(tokens[2], 10);
                    if (!isNaN(x) && !isNaN(y)) {
                        option.value = { x, y };
                    }
                }
            }
        }

        if (option.valid) {
            this.options[option.key] = option.value;
        }
    }

    shape(svgEl: SvgNode, attributes: any) {
        const points = this.orientation
            .hexCorners()
            .map((corner: Point) => corner.toString())
            .join(" ");
        svgEl.createSvg("polygon", {
            attr: {
                ...attributes,
                points,
            },
        });
    }

    getContentBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
        if (this.regions.length === 0) {
            return null;
        }

        const [vx1, vy1, vx2, vy2] = this.orientation.viewbox(this.regions);
        return {
            minX: vx1,
            maxX: vx2,
            minY: vy1,
            maxY: vy2,
        };
    }

    getInitialCenter(): Point {
        if (this.options["centered-at"] && typeof this.options["centered-at"] === "object") {
            const center = this.options["centered-at"];
            return this.orientation.pixels(new Point(center.x, center.y));
        }

        if (this.options["center-content"]) {
            const contentBounds = this.getContentBounds();
            if (contentBounds) {
                const centerX = (contentBounds.minX + contentBounds.maxX) / 2;
                const centerY = (contentBounds.minY + contentBounds.maxY) / 2;
                return new Point(centerX, centerY);
            }
        }

        const hex00 = this.regions.find((r) => r.x === 0 && r.y === 0);
        if (hex00) {
            return this.orientation.pixels(new Point(0, 0));
        }

        if (this.regions.length > 0) {
            const firstRegion = this.regions[0];
            return this.orientation.pixels(new Point(firstRegion.x, firstRegion.y));
        }

        return this.orientation.pixels(new Point(0, 0));
    }

    svgHeader(el: HTMLElement): SvgNode {
        const root = createSvgRoot(el);

        if (this.regions.length == 0) {
            return root.createSvg("svg");
        }

        const fixedWidth = 800;
        const fixedHeight = 600;
        const initialCenter = this.getInitialCenter();

        const viewBoxX = initialCenter.x - fixedWidth / 2;
        const viewBoxY = initialCenter.y - fixedHeight / 2;

        const svgEl: SvgNode = root.createSvg("svg", {
            attr: {
                "xmlns:xlink": "http://www.w3.org/1999/xlink",
                viewBox: `${viewBoxX} ${viewBoxY} ${fixedWidth} ${fixedHeight}`,
                class: "textmapper-svg",
            },
        });

        const contentBounds = this.getContentBounds();
        if (contentBounds) {
            svgEl.createSvg("rect", {
                attr: {
                    x: contentBounds.minX,
                    y: contentBounds.minY,
                    width: (contentBounds.maxX - contentBounds.minX).toFixed(0),
                    height: (contentBounds.maxY - contentBounds.minY).toFixed(0),
                    fill: "white",
                },
            });
        }

        return svgEl;
    }

    svgDefs(svgEl: SvgNode): void {
        const defsEl = svgEl.createSvg("defs");
        defsEl.appendSvgRaw(this.defs.join("\n"));

        const types: any = {};
        for (const region of this.regions) {
            for (const rtype of region.types) {
                types[rtype] = 1;
            }
        }
        for (const spline of this.splines) {
            types[spline.types] = 1;
        }

        for (const type of Object.keys(types).sort()) {
            const path = this.path[type];
            const attributes = this.attributes[type];
            if (path || attributes) {
                const gEl = defsEl.createSvg("g", {
                    attr: { id: this.namespace(type) },
                });

                if (path && !attributes) {
                    gEl.createSvg("path", {
                        attr: {
                            ...this.glowAttributes,
                            d: path,
                        },
                    });
                }
                if (attributes) {
                    this.shape(gEl, attributes);
                }
                if (path) {
                    gEl.createSvg("path", {
                        attr: {
                            ...this.pathAttributes,
                            d: path,
                        },
                    });
                }
            }
        }
    }

    svgBackgrounds(svgEl: SvgNode): void {
        const bgEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("backgrounds") },
        });
        const whitelist = Object.keys(this.attributes);
        for (const region of this.regions) {
            region.svg(bgEl, this.orientation, whitelist);
        }
    }

    svgPaths(svgEl: SvgNode): void {
        const splinesEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("paths") },
        });
        for (const spline of this.splines) {
            spline.svg(splinesEl, this.orientation, this.pathAttributes);
        }
    }

    svgThings(svgEl: SvgNode): void {
        const thingsEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("things") },
        });
        const blacklist = Object.keys(this.attributes);
        for (const region of this.regions) {
            const filtered: string[] = region.types.filter(
                (t) => !blacklist.includes(t)
            );
            region.svg(thingsEl, this.orientation, filtered);
        }
    }

    svgCoordinates(svgEl: SvgNode): void {
        const coordsEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("coordinates") },
        });
        for (const region of this.regions) {
            region.svgCoordinates(
                coordsEl,
                this.orientation,
                this.textAttributes,
                this.options["coordinates-format"]
            );
        }
    }

    svgRegions(svgEl: SvgNode): void {
        const regionsEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("regions") },
        });
        const attributes = this.attributes["default"];
        for (const region of this.regions) {
            region.svgRegion(regionsEl, this.orientation, attributes);
        }
    }

    svgPathLabels(svgEl: SvgNode): void {
        const labelsEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("path-labels") },
        });
        for (const spline of this.splines) {
            spline.svgLabel(
                labelsEl,
                this.labelAttributes,
                this.glowAttributes
            );
        }
    }

    svgLabels(svgEl: SvgNode): void {
        const labelsEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("labels") },
        });
        for (const region of this.regions) {
            region.svgLabel(
                labelsEl,
                this.orientation,
                this.labelAttributes,
                this.glowAttributes
            );
        }
    }

    private getFactionCoverage(): Map<string, Array<{ color: number; ring: number }>> {
        const coverage = new Map<string, Array<{ color: number; ring: number }>>();
        const swapEvenOdd = this.options["swap-even-odd"] || false;
        const flatTop = !this.options.horizontal;

        for (const region of this.regions) {
            for (const type of region.types) {
                const factionMatch = type.match(/^faction-(\d+)-(\d+)$/);
                if (factionMatch) {
                    const color = parseInt(factionMatch[1], 10);
                    const ringLevel = parseInt(factionMatch[2], 10);

                    if (color < 0 || color > 9 || ringLevel > 10) {
                        continue;
                    }

                    const hexes = getHexesInRings(region.x, region.y, ringLevel, flatTop, swapEvenOdd);

                    for (const hexKey of hexes) {
                        if (!coverage.has(hexKey)) {
                            coverage.set(hexKey, []);
                        }
                        coverage.get(hexKey)!.push({ color, ring: ringLevel });
                    }
                }
            }
        }

        return coverage;
    }

    svgFactionOverlays(svgEl: SvgNode): void {
        const coverage = this.getFactionCoverage();
        if (coverage.size === 0) {
            return;
        }

        const overlaysEl = svgEl.createSvg("g", {
            attr: { id: this.namespace("faction-overlays") },
        });

        const colorPalette = [
            "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
            "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80"
        ];

        for (const [hexKey, factions] of coverage.entries()) {
            const [x, y] = hexKey.split(",").map(Number);

            const uniqueColors = new Set(factions.map(f => f.color));
            const isContested = uniqueColors.size > 1;

            const primaryFaction = factions[0];
            let fillColor: string;

            if (isContested) {
                fillColor = "#888888";
            } else {
                fillColor = colorPalette[primaryFaction.color] || "#CCCCCC";
            }

            const points = this.orientation
                .hexCorners()
                .map((corner: Point) => {
                    return this.orientation
                        .pixels(new Point(x, y), corner.x, corner.y)
                        .toString();
                })
                .join(" ");

            overlaysEl.createSvg("polygon", {
                attr: {
                    points,
                    fill: fillColor,
                    "fill-opacity": "0.3",
                    stroke: fillColor,
                    "stroke-width": "4",
                    "stroke-opacity": "1.0",
                },
            });
        }
    }

    svg(el: HTMLElement) {
        const svgEl = this.svgHeader(el);
        this.svgDefs(svgEl);
        this.svgBackgrounds(svgEl);
        this.svgFactionOverlays(svgEl);
        this.svgPaths(svgEl);
        this.svgThings(svgEl);
        this.svgCoordinates(svgEl);
        this.svgRegions(svgEl);
        this.svgPathLabels(svgEl);
        this.svgLabels(svgEl);
        return svgEl;
    }
}
