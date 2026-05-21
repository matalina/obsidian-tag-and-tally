const SVG_NS = "http://www.w3.org/2000/svg";

export interface SvgNode {
    createSvg(tag: string, options?: { attr?: Record<string, string | number> }): SvgNode;
    appendSvgRaw(svg: string): void;
    textContent: string;
}

function appendParsedSvg(parent: Element, svg: string): void {
    const wrapped = `<svg xmlns="${SVG_NS}">${svg}</svg>`;
    const doc = new DOMParser().parseFromString(wrapped, "image/svg+xml");
    const root = doc.documentElement;
    while (root.firstChild) parent.appendChild(root.firstChild);
}

function wrapElement(el: Element): SvgNode {
    return {
        appendSvgRaw(value: string) {
            appendParsedSvg(el, value);
        },
        get textContent() {
            return el.textContent ?? "";
        },
        set textContent(value: string) {
            el.textContent = value;
        },
        createSvg(tag: string, options?: { attr?: Record<string, string | number> }): SvgNode {
            const child = document.createElementNS(SVG_NS, tag);
            if (options?.attr) {
                for (const [key, value] of Object.entries(options.attr)) {
                    if (value !== undefined && value !== null) {
                        child.setAttribute(key, String(value));
                    }
                }
            }
            el.appendChild(child);
            return wrapElement(child);
        },
    };
}

/**
 * Creates a root SVG element adapter from a plain HTMLElement container.
 * Returns a SvgNode whose `createSvg` appends SVG-namespaced children.
 */
export function createSvgRoot(container: HTMLElement): SvgNode {
    return {
        appendSvgRaw(value: string) {
            appendParsedSvg(container, value);
        },
        get textContent() {
            return container.textContent ?? "";
        },
        set textContent(value: string) {
            container.textContent = value;
        },
        createSvg(tag: string, options?: { attr?: Record<string, string | number> }): SvgNode {
            const child = document.createElementNS(SVG_NS, tag);
            if (options?.attr) {
                for (const [key, value] of Object.entries(options.attr)) {
                    if (value !== undefined && value !== null) {
                        child.setAttribute(key, String(value));
                    }
                }
            }
            container.appendChild(child);
            return wrapElement(child);
        },
    };
}
