export { type SvgNode } from "./svg-adapter";

export const ATTRIBUTES_REGEX = /^(\S+)\s+attributes\s+(.*)/;
export const PATH_ATTRIBUTES_REGEX = /^(\S+)\s+path\s+attributes\s+(.*)/;
export const PATH_REGEX = /^(\S+)\s+path\s+(.*)/;
export const XML_REGEX = /^(<.*>)/;
export const TEXT_REGEX = /^text\s+(.*)/;
export const GLOW_REGEX = /^glow\s+(.*)/;
export const LABEL_REGEX = /^label\s+(.*)/;
export const OPTION_REGEX = /^option\s+(.*)/;
// Hex coordinate format: XXYY (positive only, 00-99 per axis)
// Examples: "0001" -> x=00, y=01 | "0302" -> x=03, y=02
export const HEX_REGEX = /^(\d\d)(\d\d)(\d\d)?\s+(.*)/;
export const HEX_LABEL_REGEX = /["\u201C]([^"\u201D]+)["\u201D]\s*(\d+)?/;
// Spline paths use "-" as separator between coordinate pairs: 0102-0203-0304
export const SPLINE_REGEX =
    /^(\d\d\d\d(?:\d\d)?(?:-\d\d\d\d(?:\d\d)?)+)\s+(\S+)\s*(?:["\u201C\u201D](.+)["\u201C\u201D])?\s*(left|right)?\s*(\d+%)?/;
export const SPLINE_ELEMENT_SPLIT_REGEX = /^(\d\d\d\d)-?(.*)/;
export const SPLINE_POINT_REGEX = /(\d\d)(\d\d)/;
export const ATTRIBUTE_MAP_REGEX = /(\S+)="([^"]+)"/g;
export const SVG_CHOMP_WHITESPACE_REGEX = /(>)(\s+)(<)/g;
export const SVG_ID_REGEX = /(id=")(\S+)(")/g;
export const SVG_HREF_REGEX = /(xlink:href="#)(\S+)(")/g;

export type NamespaceFunction = {
    (what: string): string;
};
