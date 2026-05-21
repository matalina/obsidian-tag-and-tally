/* eslint-disable @typescript-eslint/no-explicit-any */
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
  SVGElement,
  SVG_CHOMP_WHITESPACE_REGEX,
  SVG_ID_REGEX,
  SVG_HREF_REGEX,
} from './constants';
import { Point, Orientation } from './orientation';
import { Region } from './region';
import { Spline } from './spline';
import type { Room, DoorType } from '../dungeon/types';
import { parseRoomLine } from '../dungeon/notation';
import { computeDungeonLayout, translateDungeonLayoutForBoundary } from '../dungeon/layout';
import type { DoorTile } from '../dungeon/layout';
import { DUNGEON_SVG_DATA_URIS } from '../dungeon/dungeon-svg-assets';
import type { CityStreet, CityLayout, CityHeading, CityStartAnchor, CityJunctionDef } from '../city/types';
import { parseJunctionLine, parseStreetLine, parseOptionStringToCityStartAnchor } from '../city/notation';
import { resolveCityJunctionAttachments } from '../city/junction-resolve';
import {
  boundaryClipHighlightCells,
  computeCityLayout,
  detectOutOfBoundsRoadCells,
  translateCityLayoutForBoundary,
  CITY_TILE_PX,
} from '../city/layout';

const DUNGEON_TILE_PX = 22;
const DUNGEON_MARGIN_TILES = 2;

/**
 * Get the 6 neighboring hex coordinates for a given hex
 * Works with both flat-top and pointy-top (horizontal) hexes
 */
function getHexNeighbors(
  x: number,
  y: number,
  flatTop: boolean = true,
  swapEvenOdd: boolean = false,
): Array<{ x: number; y: number }> {
  const evenOdd = swapEvenOdd ? 1 : 0;

  if (flatTop) {
    // Flat-top hexes (default)
    const isEven = Math.abs(x) % 2 === 0;

    if (isEven) {
      return [
        { x: x + 0, y: y - 1 }, // top
        { x: x + 1, y: y + 0 - evenOdd }, // top-right
        { x: x + 1, y: y + 1 - evenOdd }, // bottom-right
        { x: x + 0, y: y + 1 }, // bottom
        { x: x - 1, y: y + 1 - evenOdd }, // bottom-left
        { x: x - 1, y: y + 0 - evenOdd }, // top-left
      ];
    } else {
      return [
        { x: x + 0, y: y - 1 }, // top
        { x: x + 1, y: y - 1 + evenOdd }, // top-right
        { x: x + 1, y: y + 0 + evenOdd }, // bottom-right
        { x: x + 0, y: y + 1 }, // bottom
        { x: x - 1, y: y + 0 + evenOdd }, // bottom-left
        { x: x - 1, y: y - 1 + evenOdd }, // top-left
      ];
    }
  } else {
    // Pointy-top (horizontal) hexes
    const isEven = Math.abs(y) % 2 === 0;

    if (isEven) {
      return [
        { x: x + 0 - evenOdd, y: y - 1 }, // top-left
        { x: x + 1 - evenOdd, y: y - 1 }, // top-right
        { x: x + 1, y: y + 0 }, // right
        { x: x + 1 - evenOdd, y: y + 1 }, // bottom-right
        { x: x + 0 - evenOdd, y: y + 1 }, // bottom-left
        { x: x - 1, y: y + 0 }, // left
      ];
    } else {
      return [
        { x: x - 1 + evenOdd, y: y - 1 }, // top-left
        { x: x + 0 + evenOdd, y: y - 1 }, // top-right
        { x: x + 1, y: y + 0 }, // right
        { x: x + 0 + evenOdd, y: y + 1 }, // bottom-right
        { x: x - 1 + evenOdd, y: y + 1 }, // bottom-left
        { x: x - 1, y: y + 0 }, // left
      ];
    }
  }
}

/**
 * Get all hexes within N rings of a center hex
 * Returns a set of hex coordinates as strings "x,y"
 */
function getHexesInRings(
  centerX: number,
  centerY: number,
  rings: number,
  flatTop: boolean = true,
  swapEvenOdd: boolean = false,
): Set<string> {
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

// https://alexschroeder.ch/cgit/text-mapper/tree/lib/Game/TextMapper/Mapper.pm
export class TextMapperParser {
  id: string;
  pathId: number;
  options: any;
  regions: Region[]; // ' => sub { [] };
  attributes: any; // ' => sub { {} };
  defs: string[]; // ' => sub { [] };
  path: any; // ' => sub { {} };
  splines: Spline[]; // ' => sub { [] };
  pathAttributes: any; // ' => sub { {} };
  textAttributes: any;
  glowAttributes: any;
  labelAttributes: any;
  orientation: Orientation;
  dungeonRooms: Room[];
  cityStreets: CityStreet[];
  cityJunctions: CityJunctionDef[];
  /** Set when junction attachment resolution fails; layout should show this instead of a misleading graph error. */
  cityResolveError: string | null;
  // messages: string[]; // ' => sub { [] };

  constructor(id: string) {
    this.id = id;
    this.options = {
      horizontal: false,
      'coordinates-format': '{X}{Y}',
      'swap-even-odd': false,
      global: false,
      'map-type': 'hex',
    };
    this.regions = [];
    this.dungeonRooms = [];
    this.cityStreets = [];
    this.cityJunctions = [];
    this.cityResolveError = null;
    this.attributes = {};
    this.defs = [];
    this.path = {};
    this.splines = [];
    this.pathAttributes = {};
    this.textAttributes = '';
    this.glowAttributes = '';
    this.labelAttributes = '';
  }

  /**
   * Append the parser ID to a string. In practice, the parser ID is the
   * Obsidian document ID. This function is used when setting the `id`
   * attribute of SVG elements, so that the attribute is unique to a given
   * map, which prevents path definitions from carrying over in
   * documents with more than one map.
   */
  private namespace(what: string) {
    if (this.options.global) {
      return `${what}`;
    }
    return `${what}-${this.id}`;
  }

  /**
   * Process the source code of a map, line by line.
   */
  process(lines: string[]) {
    this.pathId = 0;
    this.dungeonRooms = [];
    this.cityStreets = [];
    this.cityJunctions = [];
    this.cityResolveError = null;

    // First, set all options.
    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      if (OPTION_REGEX.test(line)) {
        const match = line.match(OPTION_REGEX);
        this.parseOption(match[1]);
      }
    }

    if (this.options.horizontal) {
      this.orientation = new Orientation(false, this.options['swap-even-odd']);
    } else {
      this.orientation = new Orientation(true, this.options['swap-even-odd']);
    }

    // Then, body lines (hex map vs dungeon graph)
    if (this.isDungeonMap()) {
      for (const line of lines) {
        if (line.startsWith('#')) {
          continue;
        }
        if (OPTION_REGEX.test(line)) {
          continue;
        }
        const room = parseRoomLine(line);
        if (room) {
          this.dungeonRooms.push(room);
        }
      }
      return;
    }

    if (this.isCityMap()) {
      for (const line of lines) {
        if (line.startsWith('#')) {
          continue;
        }
        if (OPTION_REGEX.test(line)) {
          continue;
        }
        const junc = parseJunctionLine(line);
        if (junc) {
          this.cityJunctions.push(junc);
          continue;
        }
        const street = parseStreetLine(line);
        if (street) {
          this.cityStreets.push(street);
        }
      }
      if (this.cityJunctions.length > 0) {
        const r = resolveCityJunctionAttachments(
          this.cityStreets,
          this.cityJunctions,
          this.getResolvedCityStartAnchor(),
        );
        if (r.error) {
          this.cityResolveError = r.error;
        } else {
          this.cityResolveError = null;
          this.cityStreets = r.streets;
        }
      }
      return;
    }

    for (const line of lines) {
      if (line.startsWith('#')) {
        continue;
      }
      if (HEX_REGEX.test(line)) {
        const region = this.parseRegion(line);
        this.regions.push(region);
      } else if (SPLINE_REGEX.test(line)) {
        const spline = this.parsePath(line);
        this.splines.push(spline);
      } else if (ATTRIBUTES_REGEX.test(line)) {
        const match = line.match(ATTRIBUTES_REGEX);
        this.attributes[match[1]] = this.parseAttributes(match[2]);
      } else if (XML_REGEX.test(line)) {
        const match = line.match(XML_REGEX);
        this.def(match[1]);
      } else if (PATH_ATTRIBUTES_REGEX.test(line)) {
        const match = line.match(PATH_ATTRIBUTES_REGEX);
        this.pathAttributes[match[1]] = this.parseAttributes(match[2]);
      } else if (PATH_REGEX.test(line)) {
        const match = line.match(PATH_REGEX);
        this.path[match[1]] = match[2];
      } else if (TEXT_REGEX.test(line)) {
        const match = line.match(TEXT_REGEX);
        this.textAttributes = this.parseAttributes(match[1]);
      } else if (GLOW_REGEX.test(line)) {
        const match = line.match(GLOW_REGEX);
        this.glowAttributes = this.parseAttributes(match[1]);
      } else if (LABEL_REGEX.test(line)) {
        const match = line.match(LABEL_REGEX);
        this.labelAttributes = this.parseAttributes(match[1]);
      }
    }
  }

  isDungeonMap(): boolean {
    return this.options['map-type'] === 'dungeon';
  }

  isCityMap(): boolean {
    return this.options['map-type'] === 'city';
  }

  private getResolvedCityStartAnchor(): CityStartAnchor {
    const startPos = this.options['start-position'] as CityStartAnchor | undefined;
    if (startPos != null) {
      return startPos;
    }
    const fromOpt = this.options['city-start'] as CityStartAnchor | undefined;
    if (fromOpt != null) {
      return fromOpt;
    }
    return 'bottom';
  }

  private getCityLayoutResolved(): CityLayout {
    const anchor = this.getResolvedCityStartAnchor();
    if (this.cityResolveError) {
      return {
        segments: [],
        junctions: [],
        facadeLabels: [],
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        placementError: this.cityResolveError,
        overlapCells: [],
        boundaryCells: [],
      };
    }
    let layout = computeCityLayout(this.cityStreets, anchor, this.cityJunctions);
    const boundary = this.options.boundary as { w: number; h: number } | undefined;
    const rootSeg =
      (this.cityStreets[0] && layout.segments.find((s) => s.street.id === this.cityStreets[0]!.id)) ??
      layout.segments[0] ??
      null;
    if (boundary && rootSeg) {
      layout = translateCityLayoutForBoundary(layout, boundary, rootSeg, anchor);
    }
    if (boundary && rootSeg) {
      const boundaryCells = detectOutOfBoundsRoadCells(layout, boundary);
      layout = { ...layout, boundaryCells };
    } else {
      layout = { ...layout, boundaryCells: [] };
    }
    return layout;
  }

  private hasRenderableContent(): boolean {
    if (this.isDungeonMap()) {
      const layout = computeDungeonLayout(this.dungeonRooms);
      return layout.positions.length > 0;
    }
    if (this.isCityMap()) {
      return this.getCityLayoutResolved().segments.length > 0;
    }
    return this.regions.length > 0;
  }

  parseRegion(line: string) {
    // hex
    const match = line.match(HEX_REGEX);
    const region = this.makeRegion(match[1], match[2], match[3] || '00');
    let rest = match[4];
    while (HEX_LABEL_REGEX.test(rest)) {
      const labelMatch = rest.match(HEX_LABEL_REGEX);
      region.label = labelMatch[1];
      region.size = labelMatch[2];
      rest = rest.replace(HEX_LABEL_REGEX, '');
    }
    const types = rest.split(/\s+/).filter((t) => t.length > 0);
    region.types = types;
    return region;
  }

  parsePath(line: string) {
    // path
    const match = line.match(SPLINE_REGEX);
    const spline = this.makeSpline();
    spline.types = match[2];
    spline.label = match[3];
    spline.side = match[4];
    spline.start = match[5];

    let rest = line;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let segment: string;
      [segment, rest] = this.splitPathSegments(rest);
      if (segment === null) {
        break;
      }
      const pointMatch = segment.match(SPLINE_POINT_REGEX);
      spline.addPoint(pointMatch[1], pointMatch[2]);
    }
    return spline;
  }

  private splitPathSegments(splinePath: string): [string, string] {
    const match = splinePath.match(SPLINE_ELEMENT_SPLIT_REGEX);
    if (match === null) {
      return [null, splinePath];
    }
    return [match[1], match[2]];
  }

  def(what: string) {
    let svg = what.replace(SVG_CHOMP_WHITESPACE_REGEX, '$1$3');
    let match;
    while ((match = SVG_ID_REGEX.exec(svg))) {
      svg = svg.replace(match[0], `${match[1]}${this.namespace(match[2])}${match[3]}`);
    }
    while ((match = SVG_HREF_REGEX.exec(svg))) {
      svg = svg.replace(match[0], `${match[1]}${this.namespace(match[2])}${match[3]}`);
    }
    this.defs.push(svg);
  }

  makeRegion(x: string, y: string, z: string): Region {
    const region = new Region(this.namespace.bind(this));
    region.x = parseInt(x);
    region.y = parseInt(y);
    region.id = `hex.${region.x}.${region.y}`;
    return region;
  }

  makeSpline(): Spline {
    const spline = new Spline();
    this.pathId++;
    spline.id = this.namespace(`path-${this.pathId}`);
    return spline;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseAttributes(attrs: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output: any = {};
    let matches;
    while ((matches = ATTRIBUTE_MAP_REGEX.exec(attrs))) {
      output[matches[1]] = matches[2];
    }
    return output;
  }

  /**
   * This parses custom options which allow for turning on and off different
   * rendering options. For an option set in a map like this:
   *
   * option NAME X Y Z
   *
   * The parameters will be parsed into a string[]: ["NAME", "X", "Y", "Z"]
   * The key would be "NAME".
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseOption(optionStr: string): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const option: any = {
      valid: false,
      key: '',
      value: '',
    };

    // Tokenize the option and set the key
    const tokens = optionStr.split(' ');
    if (tokens.length < 1) {
      return option;
    }
    option.key = tokens[0];

    // Validate the option
    if (option.key === 'horizontal' || option.key === 'swap-even-odd') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'coordinates-format') {
      option.valid = true;
      option.value = tokens.slice(1).join(' ');
    } else if (option.key === 'global') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'map-type') {
      option.valid = true;
      const v = (tokens[1] || 'hex').toLowerCase();
      if (v === 'dungeon') {
        option.value = 'dungeon';
      } else if (v === 'city') {
        option.value = 'city';
      } else {
        option.value = 'hex';
      }
    } else if (option.key === 'start-position' || option.key === 'city-start') {
      const raw = tokens.slice(1).join(' ').trim();
      const a = parseOptionStringToCityStartAnchor(raw);
      if (a) {
        option.valid = true;
        option.value = a;
      }
    } else if (option.key === 'boundary') {
      let w = 0;
      let h = 0;
      const joined = tokens.slice(1).join('').trim();
      const wxhCompact = joined.match(/^(\d+)[xX,](\d+)$/);
      if (wxhCompact) {
        w = parseInt(wxhCompact[1], 10);
        h = parseInt(wxhCompact[2], 10);
      } else {
        const nums = tokens
          .slice(1)
          .map((tok) => parseInt(tok, 10))
          .filter((n) => !Number.isNaN(n) && n > 0);
        if (nums.length >= 2) {
          w = nums[0]!;
          h = nums[1]!;
        }
      }
      if (w > 0 && h > 0 && !isNaN(w) && !isNaN(h)) {
        option.valid = true;
        option.value = { w, h };
      }
    } else if (option.key === 'center-content') {
      option.valid = true;
      option.value = true;
    } else if (option.key === 'zoom') {
      option.valid = true;
      // Parse zoom option: "option zoom 1.5"
      if (tokens.length >= 2) {
        const zoomValue = parseFloat(tokens[1]);
        if (!isNaN(zoomValue) && zoomValue > 0) {
          option.value = zoomValue;
        }
      }
    } else if (option.key === 'centered-at') {
      option.valid = true;
      // Parse centered-at option:
      // "option centered-at 0000" or "option centered-at 0402" (4-digit format)
      // "option centered-at 05 10" (two separate numbers)
      if (tokens.length >= 2) {
        const coordStr = tokens[1];

        // Check if it's a 4-digit coordinate string (like "0402" or "0000")
        if (coordStr.length === 4 && /^\d{4}$/.test(coordStr)) {
          const x = parseInt(coordStr.substring(0, 2), 10);
          const y = parseInt(coordStr.substring(2, 4), 10);
          if (!isNaN(x) && !isNaN(y)) {
            option.value = { x, y };
          }
        } else if (tokens.length >= 3) {
          // Format: "option centered-at 05 10" (two separate tokens)
          const x = parseInt(tokens[1], 10);
          const y = parseInt(tokens[2], 10);
          if (!isNaN(x) && !isNaN(y)) {
            option.value = { x, y };
          }
        }
      }
    }

    // If the option is valid, then set it in this.options. It can now be
    // used throughout the rendering code.
    if (option.valid) {
      this.options[option.key] = option.value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shape(svgEl: SVGElement, attributes: any) {
    const points = this.orientation
      .hexCorners()
      .map((corner: Point) => corner.toString())
      .join(' ');
    svgEl.createSvg('polygon', {
      attr: {
        ...attributes,
        points,
      },
    });
    // return `<polygon ${attributes} points="${points}" />`;
  }

  /**
   * Calculate content bounds (min/max x/y) for pan limit calculations
   */
  getContentBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (this.isDungeonMap()) {
      const layout = computeDungeonLayout(this.dungeonRooms);
      if (layout.positions.length === 0) {
        return null;
      }
      const t = DUNGEON_TILE_PX;
      const m = DUNGEON_MARGIN_TILES;
      const boundary = this.options.boundary as { w: number; h: number } | undefined;
      if (boundary) {
        return {
          minX: -m * t,
          maxX: boundary.w * t + m * t,
          minY: -m * t,
          maxY: boundary.h * t + m * t,
        };
      }
      return {
        minX: layout.minX * t - m * t,
        maxX: layout.maxX * t + m * t,
        minY: layout.minY * t - m * t,
        maxY: layout.maxY * t + m * t,
      };
    }

    if (this.isCityMap()) {
      const layout = this.getCityLayoutResolved();
      if (layout.segments.length === 0) {
        return null;
      }
      const t = CITY_TILE_PX;
      const m = DUNGEON_MARGIN_TILES;
      const boundary = this.options.boundary as { w: number; h: number } | undefined;
      if (boundary) {
        return {
          minX: -m * t,
          maxX: boundary.w * t + m * t,
          minY: -m * t,
          maxY: boundary.h * t + m * t,
        };
      }
      return {
        minX: layout.minX * t - m * t,
        maxX: layout.maxX * t + m * t,
        minY: layout.minY * t - m * t,
        maxY: layout.maxY * t + m * t,
      };
    }

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

  /**
   * Calculate initial center point for viewBox
   * Priority: 1. centered-at option, 2. center-content option, 3. hex (0,0), 4. first hex, 5. (0,0) coordinate space
   */
  getInitialCenter(): Point {
    if (this.isDungeonMap()) {
      const b = this.getContentBounds();
      if (b) {
        return new Point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      }
      return new Point(0, 0);
    }
    if (this.isCityMap()) {
      const b = this.getContentBounds();
      if (b) {
        return new Point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      }
      return new Point(0, 0);
    }

    // 1. Check if centered-at option is specified
    if (this.options['centered-at'] && typeof this.options['centered-at'] === 'object') {
      const center = this.options['centered-at'];
      return this.orientation.pixels(new Point(center.x, center.y));
    }

    // 2. Check if center-content option is specified
    if (this.options['center-content']) {
      const contentBounds = this.getContentBounds();
      if (contentBounds) {
        // Calculate center of content bounds
        const centerX = (contentBounds.minX + contentBounds.maxX) / 2;
        const centerY = (contentBounds.minY + contentBounds.maxY) / 2;
        return new Point(centerX, centerY);
      }
    }

    // 3. Check if hex (0, 0) exists in regions
    const hex00 = this.regions.find((r) => r.x === 0 && r.y === 0);
    if (hex00) {
      return this.orientation.pixels(new Point(0, 0));
    }

    // 4. Use first hex in regions list
    if (this.regions.length > 0) {
      const firstRegion = this.regions[0];
      return this.orientation.pixels(new Point(firstRegion.x, firstRegion.y));
    }

    // 5. Fallback to (0, 0) coordinate space
    return this.orientation.pixels(new Point(0, 0));
  }

  svgHeader(el: HTMLElement): SVGElement {
    if (!this.hasRenderableContent()) {
      // @ts-ignore
      return el.createSvg('svg', {
        attr: {
          class: 'textmapper-svg',
          viewBox: '0 0 800 600',
        },
      });
    }

    // Use fixed viewBox dimensions (800x600 as default)
    // The actual viewBox will be controlled by pan/zoom in TextMapper
    const fixedWidth = 800;
    const fixedHeight = 600;
    const initialCenter = this.getInitialCenter();

    // Calculate initial viewBox centered on initial center point
    const viewBoxX = initialCenter.x - fixedWidth / 2;
    const viewBoxY = initialCenter.y - fixedHeight / 2;

    // @ts-ignore
    const svgEl: SVGElement = el.createSvg('svg', {
      attr: {
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        viewBox: `${viewBoxX} ${viewBoxY} ${fixedWidth} ${fixedHeight}`,
        class: 'textmapper-svg',
      },
    });

    // Create background rect covering the full content bounds (hex only; dungeon stays transparent)
    const contentBounds = this.getContentBounds();
    if (contentBounds && !this.isDungeonMap() && !this.isCityMap()) {
      svgEl.createSvg('rect', {
        attr: {
          x: contentBounds.minX,
          y: contentBounds.minY,
          width: (contentBounds.maxX - contentBounds.minX).toFixed(0),
          height: (contentBounds.maxY - contentBounds.minY).toFixed(0),
          fill: 'white',
        },
      });
    }

    return svgEl;
  }

  svgDefs(svgEl: SVGElement): void {
    // All the definitions are included by default. `this.defs` is populated
    // by text-mapper's own internal SVG generation code (gradients, markers,
    // hex grid patterns) — never from user input — so innerHTML is safe here.
    const defsEl = svgEl.createSvg('defs');
    defsEl.innerHTML = this.defs.join('\n');

    // collect region types from attributes and paths in case the sets don't overlap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types: any = {};
    for (const region of this.regions) {
      for (const rtype of region.types) {
        types[rtype] = 1;
      }
    }
    for (const spline of this.splines) {
      types[spline.types] = 1;
    }

    // now go through them all
    for (const type of Object.keys(types).sort()) {
      const path = this.path[type];
      const attributes = this.attributes[type];
      if (path || attributes) {
        const gEl = defsEl.createSvg('g', {
          attr: { id: this.namespace(type) },
        });

        // just shapes get a glow, eg. a house (must come first)
        if (path && !attributes) {
          gEl.createSvg('path', {
            attr: {
              ...this.glowAttributes,
              d: path,
            },
          });
        }
        // region with attributes get a shape (square or hex), eg. plains and grass
        if (attributes) {
          this.shape(gEl, attributes);
        }
        // and now the attributes themselves the shape itself
        if (path) {
          gEl.createSvg('path', {
            attr: {
              ...this.pathAttributes,
              d: path,
            },
          });
        }
      }
    }
  }

  svgBackgrounds(svgEl: SVGElement): void {
    const bgEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('backgrounds') },
    });
    const whitelist = Object.keys(this.attributes);
    for (const region of this.regions) {
      region.svg(bgEl, this.orientation, whitelist);
    }
  }

  svgPaths(svgEl: SVGElement): void {
    const splinesEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('paths') },
    });
    for (const spline of this.splines) {
      spline.svg(splinesEl, this.orientation, this.pathAttributes);
    }
  }

  svgThings(svgEl: SVGElement): void {
    const thingsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('things') },
    });
    const blacklist = Object.keys(this.attributes);
    for (const region of this.regions) {
      const filtered: string[] = region.types.filter((t) => !blacklist.includes(t));
      region.svg(thingsEl, this.orientation, filtered);
    }
  }

  svgCoordinates(svgEl: SVGElement): void {
    const coordsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('coordinates') },
    });
    for (const region of this.regions) {
      region.svgCoordinates(coordsEl, this.orientation, this.textAttributes, this.options['coordinates-format']);
    }
  }

  svgRegions(svgEl: SVGElement): void {
    const regionsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('regions') },
    });
    const attributes = this.attributes['default'];
    for (const region of this.regions) {
      region.svgRegion(regionsEl, this.orientation, attributes);
    }
  }

  svgPathLabels(svgEl: SVGElement): void {
    const labelsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('path-labels') },
    });
    for (const spline of this.splines) {
      spline.svgLabel(labelsEl, this.labelAttributes, this.glowAttributes);
    }
  }

  svgLabels(svgEl: SVGElement): void {
    const labelsEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('labels') },
    });
    for (const region of this.regions) {
      region.svgLabel(labelsEl, this.orientation, this.labelAttributes, this.glowAttributes);
    }
  }

  /**
   * Parse faction attributes from regions and calculate coverage
   * Format: faction-(color)-(ring) where color is 0-9 and ring is 0-10
   * Returns a map of hex coordinates to faction colors and ring levels
   */
  private getFactionCoverage(): Map<string, Array<{ color: number; ring: number }>> {
    const coverage = new Map<string, Array<{ color: number; ring: number }>>();
    const swapEvenOdd = this.options['swap-even-odd'] || false;
    const flatTop = !this.options.horizontal; // horizontal means pointy-top

    for (const region of this.regions) {
      // Look for faction attributes in region types (e.g., "faction-0-1", "faction-2-3")
      // Format: faction-(color 0-9)-(ring 0-10)
      for (const type of region.types) {
        const factionMatch = type.match(/^faction-(\d+)-(\d+)$/);
        if (factionMatch) {
          const color = parseInt(factionMatch[1], 10);
          const ringLevel = parseInt(factionMatch[2], 10);

          // Skip if color is out of range (0-9 for 10 colors) or ring exceeds 10
          if (color < 0 || color > 9 || ringLevel > 10) {
            continue;
          }

          // Get all hexes within the specified number of rings
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

  /**
   * Render faction overlays as transparent backgrounds with darker borders
   */
  svgFactionOverlays(svgEl: SVGElement): void {
    const coverage = this.getFactionCoverage();
    if (coverage.size === 0) {
      return; // No faction overlays to render
    }

    const overlaysEl = svgEl.createSvg('g', {
      attr: { id: this.namespace('faction-overlays') },
    });

    // Predefined color palette for factions (10 colors, indexed 0-9)
    const colorPalette = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA07A',
      '#98D8C8',
      '#F7DC6F',
      '#BB8FCE',
      '#85C1E2',
      '#F8B739',
      '#52BE80',
    ];

    // Render each covered hex (even if the hex isn't explicitly drawn in the map)
    for (const [hexKey, factions] of coverage.entries()) {
      const [x, y] = hexKey.split(',').map(Number);

      // Determine if this hex is contested (covered by multiple different colors)
      const uniqueColors = new Set(factions.map((f) => f.color));
      const isContested = uniqueColors.size > 1;

      // Use the first faction's color (or a special color for contested areas)
      const primaryFaction = factions[0];
      let fillColor: string;

      if (isContested) {
        // Gray for contested areas (multiple colors)
        fillColor = '#888888';
      } else {
        // Use the color from the palette based on the color number (0-9)
        fillColor = colorPalette[primaryFaction.color] || '#CCCCCC';
      }

      // Get hex corners for rendering
      const points = this.orientation
        .hexCorners()
        .map((corner: Point) => {
          return this.orientation.pixels(new Point(x, y), corner.x, corner.y).toString();
        })
        .join(' ');

      // Render the overlay with transparent fill and darker border
      overlaysEl.createSvg('polygon', {
        attr: {
          points,
          fill: fillColor,
          'fill-opacity': '0.3', // Transparent fill
          stroke: fillColor,
          'stroke-width': '4',
          'stroke-opacity': '1.0', // Fully opaque darker border
        },
      });
    }
  }

  svg(el: HTMLElement) {
    const svgEl = this.svgHeader(el);
    if (this.isDungeonMap()) {
      this.svgDungeon(svgEl);
      return svgEl;
    }
    if (this.isCityMap()) {
      this.svgCity(svgEl);
      return svgEl;
    }
    this.svgDefs(svgEl);
    this.svgBackgrounds(svgEl);
    this.svgFactionOverlays(svgEl); // Render faction overlays after backgrounds so they're visible
    this.svgPaths(svgEl);
    this.svgThings(svgEl);
    this.svgCoordinates(svgEl);
    this.svgRegions(svgEl);
    this.svgPathLabels(svgEl);
    this.svgLabels(svgEl);
    return svgEl;
  }

  private cityHeadingDelta(h: CityHeading): { dx: number; dy: number } {
    switch (h) {
      case 'N':
        return { dx: 0, dy: -1 };
      case 'S':
        return { dx: 0, dy: 1 };
      case 'E':
        return { dx: 1, dy: 0 };
      case 'W':
        return { dx: -1, dy: 0 };
    }
  }

  private svgCity(svgEl: SVGElement): void {
    const layout = this.getCityLayoutResolved();
    const TILE = CITY_TILE_PX;
    const boundary = this.options.boundary as { w: number; h: number } | undefined;

    const defsEl = svgEl.createSvg('defs');
    if (boundary) {
      const clipId = this.namespace('city-boundary');
      const clipPathEl = defsEl.createSvg('clipPath', {
        attr: { id: clipId },
      });
      clipPathEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
        },
      });
    }

    const cityFloorPatternId = this.namespace('city-floor');
    const patternEl = defsEl.createSvg('pattern', {
      attr: {
        id: cityFloorPatternId,
        width: TILE,
        height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
    });
    patternEl.createSvg('image', {
      attr: {
        href: DUNGEON_SVG_DATA_URIS.floor,
        x: 0,
        y: 0,
        width: TILE,
        height: TILE,
        preserveAspectRatio: 'none',
      },
    });

    const clipId = boundary ? this.namespace('city-boundary') : undefined;
    const contentParent = clipId
      ? svgEl.createSvg('g', {
          attr: { 'clip-path': `url(#${clipId})` },
        })
      : svgEl;
    /**
     * Unbounded: pack to origin using layout min (includes pad) so SVG is compact.
     * Bounded: grid coords are already in boundary tile space after translateCityLayoutForBoundary;
     * translating by layout.minX would shift roads inside the clip (layout.min is padded wider than the road bbox).
     */
    const cityGAttr: Record<string, string> = { id: this.namespace('city') };
    if (!boundary) {
      cityGAttr.transform = `translate(${-layout.minX * TILE},${-layout.minY * TILE})`;
    }
    const gEl = contentParent.createSvg('g', {
      attr: cityGAttr,
    });

    const floorTileKey = (gx: number, gy: number) => `${gx},${gy}`;
    const floorSeen = new Set<string>();

    const drawFloorCell = (gx: number, gy: number) => {
      const key = floorTileKey(gx, gy);
      if (floorSeen.has(key)) return;
      floorSeen.add(key);
      const rx = gx * TILE;
      const ry = gy * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: rx,
          y: ry,
          width: TILE,
          height: TILE,
          fill: `url(#${cityFloorPatternId})`,
          stroke: '#666',
          'stroke-width': 1,
        },
      });
    };

    for (const seg of layout.segments) {
      const { dx, dy } = this.cityHeadingDelta(seg.heading);
      for (let k = 0; k < seg.street.length; k++) {
        const gx = seg.startGX + dx * k;
        const gy = seg.startGY + dy * k;
        drawFloorCell(gx, gy);
      }
      /* Midpoint of spine cell centers so the name is not clipped at the segment start */
      const Ln = seg.street.length;
      const nameCx = seg.startGX + 0.5 + (dx * (Ln - 1)) / 2;
      const nameCy = seg.startGY + 0.5 + (dy * (Ln - 1)) / 2;
      const mx = nameCx * TILE;
      const my = nameCy * TILE;
      const nameEl = gEl.createSvg('text', {
        attr: {
          x: mx.toFixed(1),
          y: my.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '9',
          fill: '#111',
        },
      });
      nameEl.textContent = seg.street.name;
    }

    const junctionByKey = new Map<string, (typeof layout.junctions)[0]>();
    for (const j of layout.junctions) {
      junctionByKey.set(`${j.gx},${j.gy}`, j);
    }
    for (const j of junctionByKey.values()) {
      for (const c of j.cells) {
        drawFloorCell(c.gx, c.gy);
      }
    }

    const junctionTileKeys = new Set<string>();
    for (const j of layout.junctions) {
      for (const c of j.cells) {
        junctionTileKeys.add(floorTileKey(c.gx, c.gy));
      }
    }
    for (const jk of junctionTileKeys) {
      const comma = jk.indexOf(',');
      const jgx = Number(jk.slice(0, comma));
      const jgy = Number(jk.slice(comma + 1));
      gEl.createSvg('rect', {
        attr: {
          x: jgx * TILE,
          y: jgy * TILE,
          width: TILE,
          height: TILE,
          fill: '#b8c4d4',
          'fill-opacity': '0.55',
          stroke: 'none',
        },
      });
    }

    const redMaskAttr = {
      width: TILE,
      height: TILE,
      fill: '#d32f2f',
      'fill-opacity': '0.55',
      stroke: '#b71c1c',
      'stroke-width': 1,
    } as const;
    for (const oc of layout.overlapCells) {
      gEl.createSvg('rect', {
        attr: {
          x: oc.gx * TILE,
          y: oc.gy * TILE,
          ...redMaskAttr,
        },
      });
    }

    const boundaryClipHighlight =
      boundary && layout.boundaryCells.length > 0 ? boundaryClipHighlightCells(layout, boundary) : [];
    for (const hc of boundaryClipHighlight) {
      gEl.createSvg('rect', {
        attr: {
          x: hc.gx * TILE,
          y: hc.gy * TILE,
          ...redMaskAttr,
        },
      });
    }

    const junctionLabelByKey = new Map<string, (typeof layout.junctions)[0]>();
    for (const j of layout.junctions) {
      junctionLabelByKey.set(`${j.gx},${j.gy}`, j);
    }
    for (const j of junctionLabelByKey.values()) {
      if (!j.label) continue;
      const jtx = j.label.length > 14 ? `${j.label.slice(0, 12)}…` : j.label;
      const jcx = (j.gx + 0.5) * TILE;
      const jcy = (j.gy + 0.5) * TILE;
      const jLabelEl = gEl.createSvg('text', {
        attr: {
          x: jcx.toFixed(1),
          y: jcy.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '7',
          fill: '#0e3a4f',
          stroke: '#f2f7fa',
          'stroke-width': '0.45',
          'paint-order': 'stroke fill',
        },
      });
      jLabelEl.textContent = jtx;
    }

    const facadeFs = 7;
    for (const f of layout.facadeLabels) {
      const tx = f.text.length > 14 ? `${f.text.slice(0, 12)}…` : f.text;
      /* f.gx/f.gy are already tile-space positions (cell center ± offset) */
      const lx = f.gx * TILE;
      const ly = f.gy * TILE;
      const padX = 3;
      const padY = 2;
      const boxW = Math.max(facadeFs * 1.65, 0.52 * facadeFs * tx.length + padX * 2);
      const boxH = facadeFs * 1.22 + padY * 2;
      const strokeC = f.side === 'L' ? '#1a4d8c' : '#6b2d5c';
      gEl.createSvg('rect', {
        attr: {
          x: (lx - boxW / 2).toFixed(1),
          y: (ly - boxH / 2).toFixed(1),
          width: boxW.toFixed(1),
          height: boxH.toFixed(1),
          rx: 2,
          ry: 2,
          fill: f.side === 'L' ? '#eef4fb' : '#f7edf4',
          stroke: strokeC,
          'stroke-width': 0.75,
          'fill-opacity': '0.94',
        },
      });
      const fe = gEl.createSvg('text', {
        attr: {
          x: lx.toFixed(1),
          y: ly.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': String(facadeFs),
          fill: strokeC,
        },
      });
      fe.textContent = tx;
    }

    if (layout.placementError) {
      const warn = svgEl.createSvg('text', {
        attr: {
          x: '8',
          y: '16',
          'font-size': '11',
          fill: '#b00',
        },
      });
      warn.textContent = layout.placementError;
    }

    if (boundary) {
      svgEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 2,
          'pointer-events': 'none',
        },
      });
      if (layout.boundaryCells.length > 0) {
        const clipHint = svgEl.createSvg('text', {
          attr: {
            x: String(boundary.w * TILE - 6),
            y: '12',
            'text-anchor': 'end',
            'font-size': '9',
            fill: '#8a5a00',
            'font-weight': '600',
          },
        });
        clipHint.textContent = 'Clipped';
      }
    }
  }

  private dungeonDoorAssetKey(d: DoorTile): keyof typeof DUNGEON_SVG_DATA_URIS {
    if (d.doorType?.startsWith('stairs')) {
      return 'stairs';
    }
    const reinforced = !!d.reinforced;
    const k = d.doorType;
    if (reinforced && k === 'locked') {
      return 'reinforced-locked';
    }
    if (reinforced && k === 'secret') {
      return 'reinforced-secret';
    }
    if (reinforced && k === 'trapped') {
      return 'reinforced-trapped';
    }
    if (k === undefined) {
      return reinforced ? 'reinforced' : 'unlocked';
    }
    if (k === 'open' || k === 'unlocked' || k === 'locked' || k === 'reinforced' || k === 'trapped' || k === 'secret') {
      return k;
    }
    return 'unlocked';
  }

  /** Passage only for explicit [open]; bare -> / => show door icons. */
  private dungeonExitShowsIcon(d: DoorTile): boolean {
    return d.doorType !== 'open';
  }

  private dungeonDoorTransform(d: DoorTile, cx: number, cy: number): string | undefined {
    const stairRot: Partial<Record<DoorType, number>> = {
      stairs: 0,
      'stairs-down': 0,
      'stairs-up': 180,
      'stairs-left': -90,
      'stairs-right': 90,
    };
    if (d.doorType && d.doorType in stairRot) {
      const angle = stairRot[d.doorType as DoorType] ?? 0;
      return angle !== 0 ? `rotate(${angle}, ${cx}, ${cy})` : undefined;
    }
    if (d.direction === 'E' || d.direction === 'W') {
      return `rotate(90, ${cx}, ${cy})`;
    }
    return undefined;
  }

  /** Center of room rect ∩ boundary in px; null if no overlap (post-translate coords). */
  private dungeonClippedLabelCenterPx(
    roomX: number,
    roomY: number,
    roomW: number,
    roomH: number,
    tile: number,
    boundary: { w: number; h: number },
  ): { cx: number; cy: number } | null {
    const rx = roomX * tile;
    const ry = roomY * tile;
    const rw = roomW * tile;
    const rh = roomH * tile;
    const bx2 = boundary.w * tile;
    const by2 = boundary.h * tile;
    const ix = Math.max(rx, 0);
    const iy = Math.max(ry, 0);
    const ix2 = Math.min(rx + rw, bx2);
    const iy2 = Math.min(ry + rh, by2);
    if (ix2 <= ix || iy2 <= iy) {
      return null;
    }
    return { cx: (ix + ix2) / 2, cy: (iy + iy2) / 2 };
  }

  private svgDungeon(svgEl: SVGElement): void {
    let layout = computeDungeonLayout(this.dungeonRooms);
    const boundary = this.options.boundary as { w: number; h: number } | undefined;
    const entrance = this.dungeonRooms.find((r) => r.type === 'entrance');
    if (boundary && entrance) {
      layout = translateDungeonLayoutForBoundary(layout, boundary, entrance);
    }
    const TILE = DUNGEON_TILE_PX;
    const defsEl = svgEl.createSvg('defs');

    if (boundary) {
      const clipId = this.namespace('dungeon-boundary');
      const clipPathEl = defsEl.createSvg('clipPath', {
        attr: { id: clipId },
      });
      clipPathEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
        },
      });
    }

    const floorPatternId = this.namespace('dungeon-floor');
    // One pattern cell = one dungeon layout unit (notation width/height and door tile = 1 cell each).
    const patternEl = defsEl.createSvg('pattern', {
      attr: {
        id: floorPatternId,
        width: TILE,
        height: TILE,
        patternUnits: 'userSpaceOnUse',
      },
    });
    patternEl.createSvg('image', {
      attr: {
        href: DUNGEON_SVG_DATA_URIS.floor,
        x: 0,
        y: 0,
        width: TILE,
        height: TILE,
        preserveAspectRatio: 'none',
      },
    });

    const doorAssetNames = [
      'open',
      'unlocked',
      'locked',
      'reinforced',
      'trapped',
      'secret',
      'stairs',
      'reinforced-locked',
      'reinforced-secret',
      'reinforced-trapped',
    ] as const;
    for (const name of doorAssetNames) {
      const symId = this.namespace(`door-${name}`);
      const sym = defsEl.createSvg('symbol', {
        attr: { id: symId, viewBox: '0 0 240 240' },
      });
      sym.createSvg('image', {
        attr: {
          href: DUNGEON_SVG_DATA_URIS[name],
          width: 240,
          height: 240,
        },
      });
    }

    const clipId = boundary ? this.namespace('dungeon-boundary') : undefined;
    const contentParent = clipId
      ? svgEl.createSvg('g', {
          attr: { 'clip-path': `url(#${clipId})` },
        })
      : svgEl;
    const gEl = contentParent.createSvg('g', {
      attr: { id: this.namespace('dungeon') },
    });

    const primaryConflictId = layout.placementPrimaryConflictRoomId;
    for (const { room, x, y } of layout.positions) {
      const rx = x * TILE;
      const ry = y * TILE;
      const rw = room.width * TILE;
      const rh = room.height * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          fill: `url(#${floorPatternId})`,
        },
      });
      if (primaryConflictId != null && room.id === primaryConflictId) {
        gEl.createSvg('rect', {
          attr: {
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            fill: 'rgba(220, 60, 60, 0.42)',
          },
        });
      }
    }

    for (const { room, x, y } of layout.positions) {
      let cx: number;
      let cy: number;
      if (boundary) {
        const clipped = this.dungeonClippedLabelCenterPx(x, y, room.width, room.height, TILE, boundary);
        if (!clipped) {
          continue;
        }
        cx = clipped.cx;
        cy = clipped.cy;
      } else {
        cx = (x + room.width / 2) * TILE;
        cy = (y + room.height / 2) * TILE;
      }
      const textEl = gEl.createSvg('text', {
        attr: {
          x: cx.toFixed(1),
          y: cy.toFixed(1),
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-size': '11',
          fill: '#333',
        },
      });
      textEl.textContent = room.name;
    }

    for (const d of layout.doors) {
      const dx = d.x * TILE;
      const dy = d.y * TILE;
      gEl.createSvg('rect', {
        attr: {
          x: dx,
          y: dy,
          width: TILE,
          height: TILE,
          fill: `url(#${floorPatternId})`,
        },
      });
      if (!this.dungeonExitShowsIcon(d)) {
        continue;
      }
      const asset = this.dungeonDoorAssetKey(d);
      const symId = this.namespace(`door-${asset}`);
      const cx = (d.x + 0.5) * TILE;
      const cy = (d.y + 0.5) * TILE;
      const transform = this.dungeonDoorTransform(d, cx, cy);
      const parent = transform ? gEl.createSvg('g', { attr: { transform } }) : gEl;
      parent.createSvg('use', {
        attr: {
          href: `#${symId}`,
          x: dx,
          y: dy,
          width: TILE,
          height: TILE,
        },
      });
    }

    if (boundary) {
      svgEl.createSvg('rect', {
        attr: {
          x: 0,
          y: 0,
          width: boundary.w * TILE,
          height: boundary.h * TILE,
          fill: 'none',
          stroke: '#666',
          'stroke-width': 2,
          'pointer-events': 'none',
        },
      });
    }
  }
}
