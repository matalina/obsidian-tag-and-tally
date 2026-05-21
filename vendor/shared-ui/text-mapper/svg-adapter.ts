const SVG_NS = "http://www.w3.org/2000/svg";

export interface SvgNode {
    createSvg(tag: string, options?: { attr?: Record<string, string | number> }): SvgNode;
    innerHTML: string;
    textContent: string;
}

function wrapElement(el: Element): SvgNode {
    return {
        get innerHTML() {
            return el.innerHTML;
        },
        set innerHTML(value: string) {
            el.innerHTML = value;
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
        get innerHTML() {
            return container.innerHTML;
        },
        set innerHTML(value: string) {
            container.innerHTML = value;
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
