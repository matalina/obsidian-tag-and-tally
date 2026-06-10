import { shallowRef, ref, type Ref, type ShallowRef } from "vue";
import { TextMapperParser, Point, TAG_AND_TALLY } from "../text-mapper";

export type SaveBlobFn = (blob: Blob, suggestedName: string) => Promise<void>;

export type HexClickHandler = (coordString: string) => void;

export interface UseTextMapperReturn {
    parser: ShallowRef<TextMapperParser | null>;
    factionOverlaysVisible: Ref<boolean>;

    render(containerEl: HTMLElement, source: string): void;
    attachHexLinkHandlers(
        containerEl: HTMLElement,
        links: Record<string, string>,
        onHexClick: HexClickHandler,
    ): void;
    updateLinkStyles(containerEl: HTMLElement, links: Record<string, string>): void;
    attachHexNoteIndicators(
        containerEl: HTMLElement,
        populatedHexes: string[],
        onHexNoteClick: HexClickHandler,
    ): void;
    cleanup(): void;
    recenter(): void;
    centerOnHex(x: number, y: number): void;
    exportPng(saveFn: SaveBlobFn, baseName?: string): Promise<void>;
    toggleFactionOverlays(): void;
}

let idCounter = 0;
function nextId() {
    return `map-${++idCounter}`;
}

function getThemeFromSource(source: string): string | null {
    const match = source.match(/^option\s+theme\s+(\S+)/m);
    return match ? match[1] : null;
}

function getZoomFromSource(source: string): number | null {
    const match = source.match(/^option\s+zoom\s+([\d.]+)/m);
    if (match) {
        const v = parseFloat(match[1]);
        return isNaN(v) ? null : v;
    }
    return null;
}

export function useTextMapper(): UseTextMapperReturn {
    const parser = shallowRef<TextMapperParser | null>(null);
    const factionOverlaysVisible = ref(true);

    let svgDomElement: SVGSVGElement | null = null;
    let contentBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

    const fixedViewBoxWidth = 800;
    const fixedViewBoxHeight = 600;
    const minZoom = 0.5;
    const maxZoom = 4.0;

    let panX = 0;
    let panY = 0;
    let zoom = 1.0;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPanX = 0;
    let dragStartPanY = 0;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartPanX = 0;
    let touchStartPanY = 0;

    const boundHandlers: Array<[EventTarget, string, EventListener, any]> = [];

    function on(el: EventTarget, event: string, handler: EventListener, opts?: any) {
        el.addEventListener(event, handler, opts);
        boundHandlers.push([el, event, handler, opts]);
    }

    function getViewBoxX(): number {
        if (!parser.value) return 0;
        const initialCenter = parser.value.getInitialCenter();
        const vbw = fixedViewBoxWidth / zoom;
        return initialCenter.x - vbw / 2 + panX;
    }

    function getViewBoxY(): number {
        if (!parser.value) return 0;
        const initialCenter = parser.value.getInitialCenter();
        const vbh = fixedViewBoxHeight / zoom;
        return initialCenter.y - vbh / 2 + panY;
    }

    function applyPanLimits() {
        if (!contentBounds || !parser.value) return;
        const vbw = fixedViewBoxWidth / zoom;
        const vbh = fixedViewBoxHeight / zoom;
        const initialCenter = parser.value.getInitialCenter();

        const minPanX = contentBounds.minX - initialCenter.x + vbw / 2;
        const maxPanX = contentBounds.maxX - initialCenter.x - vbw / 2;
        const minPanY = contentBounds.minY - initialCenter.y + vbh / 2;
        const maxPanY = contentBounds.maxY - initialCenter.y - vbh / 2;

        panX = Math.max(minPanX, Math.min(maxPanX, panX));
        panY = Math.max(minPanY, Math.min(maxPanY, panY));
    }

    function updateViewBox() {
        if (!svgDomElement) return;
        const vx = getViewBoxX();
        const vy = getViewBoxY();
        const vw = fixedViewBoxWidth / zoom;
        const vh = fixedViewBoxHeight / zoom;
        svgDomElement.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0 || !svgDomElement) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartPanX = panX;
        dragStartPanY = panY;
        svgDomElement.classList.add("is-dragging");
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging || !svgDomElement) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const rect = svgDomElement.getBoundingClientRect();
        const svgDx = (dx / rect.width) * (fixedViewBoxWidth / zoom);
        const svgDy = (dy / rect.height) * (fixedViewBoxHeight / zoom);
        panX = dragStartPanX - svgDx;
        panY = dragStartPanY - svgDy;
        applyPanLimits();
        updateViewBox();
    }

    function handleMouseUp() {
        if (!isDragging || !svgDomElement) return;
        isDragging = false;
        svgDomElement.classList.remove("is-dragging");
    }

    function handleTouchStart(e: TouchEvent) {
        if (e.touches.length !== 1 || !svgDomElement) return;
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartPanX = panX;
        touchStartPanY = panY;
    }

    function handleTouchMove(e: TouchEvent) {
        if (e.touches.length !== 1 || !svgDomElement) return;
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const rect = svgDomElement.getBoundingClientRect();
        const svgDx = (dx / rect.width) * (fixedViewBoxWidth / zoom);
        const svgDy = (dy / rect.height) * (fixedViewBoxHeight / zoom);
        panX = touchStartPanX - svgDx;
        panY = touchStartPanY - svgDy;
        applyPanLimits();
        updateViewBox();
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        if (!svgDomElement || !parser.value) return;
        const rect = svgDomElement.getBoundingClientRect();

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const svgX = (mouseX / rect.width) * (fixedViewBoxWidth / zoom) + getViewBoxX();
        const svgY = (mouseY / rect.height) * (fixedViewBoxHeight / zoom) + getViewBoxY();

        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * zoomDelta));
        if (newZoom === zoom) return;

        const newVBW = fixedViewBoxWidth / newZoom;
        const newVBH = fixedViewBoxHeight / newZoom;
        const newVBX = svgX - (mouseX / rect.width) * newVBW;
        const newVBY = svgY - (mouseY / rect.height) * newVBH;

        zoom = newZoom;
        const initialCenter = parser.value.getInitialCenter();
        panX = newVBX - (initialCenter.x - newVBW / 2);
        panY = newVBY - (initialCenter.y - newVBH / 2);

        applyPanLimits();
        updateViewBox();
    }

    function handleDblClick() {
        recenter();
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
    }

    function applyFactionOverlayVisibility() {
        if (!svgDomElement || !parser.value) return;
        const fid = parser.value.options.global
            ? "faction-overlays"
            : `faction-overlays-${parser.value.id}`;
        const el = svgDomElement.querySelector(`#${fid}`) as SVGGElement | null;
        if (el) {
            el.classList.toggle("text-mapper-hidden", !factionOverlaysVisible.value);
        }
    }

    function setupEventHandlers(svg: SVGSVGElement) {
        on(svg, "mousedown", handleMouseDown as EventListener);
        on(svg, "mousemove", handleMouseMove as EventListener);
        on(svg, "mouseup", handleMouseUp as EventListener);
        on(svg, "mouseleave", handleMouseUp as EventListener);
        on(svg, "touchstart", handleTouchStart as EventListener, { passive: false });
        on(svg, "touchmove", handleTouchMove as EventListener, { passive: false });
        on(svg, "touchend", (() => {}) as EventListener);
        on(svg, "wheel", handleWheel as EventListener, { passive: false });
        on(svg, "contextmenu", handleContextMenu as EventListener);
        on(svg, "dblclick", handleDblClick as EventListener);
    }

    function render(containerEl: HTMLElement, source: string) {
        cleanup();
        containerEl.replaceChildren();

        const mapDiv = document.createElement("div");
        mapDiv.className = "textmapper";
        containerEl.appendChild(mapDiv);

        const themeFromSource = getThemeFromSource(source);
        const themeConstant = TAG_AND_TALLY;
        void themeFromSource; // only one theme supported

        const totalSource = themeConstant.split("\n").concat(source.split("\n"));
        const id = nextId();

        const p = new TextMapperParser(id);
        p.process(totalSource);
        p.svg(mapDiv);
        parser.value = p;

        svgDomElement = mapDiv.querySelector("svg") as SVGSVGElement;
        contentBounds = p.getContentBounds();

        const zoomFromSource = getZoomFromSource(source);
        if (zoomFromSource !== null) {
            zoom = Math.max(minZoom, Math.min(maxZoom, zoomFromSource));
        }

        if (svgDomElement) {
            svgDomElement.classList.add("text-mapper-pannable");
            updateViewBox();
            applyFactionOverlayVisibility();
            setupEventHandlers(svgDomElement);
        }
    }

    function cleanup() {
        for (const [el, event, handler, opts] of boundHandlers) {
            el.removeEventListener(event, handler, opts);
        }
        boundHandlers.length = 0;
        svgDomElement = null;
        contentBounds = null;
        parser.value = null;
        panX = 0;
        panY = 0;
        zoom = 1.0;
        isDragging = false;
    }

    function recenter() {
        panX = 0;
        panY = 0;
        applyPanLimits();
        updateViewBox();
    }

    function centerOnHex(x: number, y: number) {
        if (!parser.value) return;
        const hexPoint = parser.value.orientation.pixels(new Point(x, y));
        const initialCenter = parser.value.getInitialCenter();
        panX = hexPoint.x - initialCenter.x;
        panY = hexPoint.y - initialCenter.y;
        applyPanLimits();
        updateViewBox();
    }

    async function exportPng(saveFn: SaveBlobFn, baseName = "text-mapper-export") {
        try {
            if (!svgDomElement || !parser.value) return;

            const cb = parser.value.getContentBounds();
            if (!cb) return;

            let width = cb.maxX - cb.minX;
            let height = cb.maxY - cb.minY;
            if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) return;

            const MAX_DIMENSION = 4096;
            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
                width = Math.floor(width * scale);
                height = Math.floor(height * scale);
            }
            width = Math.max(1, Math.floor(width));
            height = Math.max(1, Math.floor(height));

            const svgClone = svgDomElement.cloneNode(true) as SVGSVGElement;
            svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
            svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
            svgClone.setAttribute("viewBox", `${cb.minX} ${cb.minY} ${cb.maxX - cb.minX} ${cb.maxY - cb.minY}`);
            svgClone.setAttribute("width", width.toString());
            svgClone.setAttribute("height", height.toString());

            const svgData = new XMLSerializer().serializeToString(svgClone);
            const svgDataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, width, height);

            const img = new Image();

            await new Promise<void>((resolve, reject) => {
                const timeout = window.setTimeout(() => {
                    reject(new Error("Timeout loading SVG image"));
                }, 10000);

                img.onload = () => {
                    window.clearTimeout(timeout);
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve();
                };
                img.onerror = (_e) => {
                    window.clearTimeout(timeout);
                    reject(new Error("Failed to load SVG image"));
                };
                img.src = svgDataUri;
            });

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), "image/png");
            });
            if (!blob) return;

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
            await saveFn(blob, `${baseName}-${timestamp}.png`);
        } catch (err) {
            console.error("exportPng failed:", err);
        }
    }

    function toggleFactionOverlays() {
        factionOverlaysVisible.value = !factionOverlaysVisible.value;
        applyFactionOverlayVisibility();
    }

    function attachHexNoteIndicators(
        _containerEl: HTMLElement,
        populatedHexes: string[],
        onHexNoteClick: HexClickHandler,
    ) {
        if (!parser.value || !svgDomElement || populatedHexes.length === 0) return;

        const SVG_NS = "http://www.w3.org/2000/svg";
        const p = parser.value;
        const orientation = p.orientation;

        const existingGroup = svgDomElement.querySelector("#hex-note-indicators");
        if (existingGroup) existingGroup.remove();

        const indicatorGroup = document.createElementNS(SVG_NS, "g");
        indicatorGroup.setAttribute("id", "hex-note-indicators");

        const iconSize = 20;

        for (const hexCoord of populatedHexes) {
            if (hexCoord.length !== 4) continue;
            const x = parseInt(hexCoord.slice(0, 2), 10);
            const y = parseInt(hexCoord.slice(2, 4), 10);
            if (isNaN(x) || isNaN(y)) continue;

            const region = p.regions.find((r) => r.x === x && r.y === y);
            if (!region) continue;

            const center = orientation.pixels(new Point(x, y));
            const iconX = center.x;
            const iconY = center.y + orientation.dy * 0.8;

            const g = document.createElementNS(SVG_NS, "g");
            g.setAttribute("class", "hex-note-indicator");
            g.setAttribute("data-hex", hexCoord);
            g.classList.add("text-mapper-clickable");
            g.setAttribute("transform",
                `translate(${(iconX - iconSize / 2).toFixed(1)}, ${(iconY - iconSize / 2).toFixed(1)})`);

            const circle = document.createElementNS(SVG_NS, "circle");
            circle.setAttribute("cx", (iconSize / 2).toString());
            circle.setAttribute("cy", (iconSize / 2).toString());
            circle.setAttribute("r", (iconSize / 2).toString());
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", "currentColor");
            circle.setAttribute("stroke-width", "1.5");
            g.appendChild(circle);

            const line = document.createElementNS(SVG_NS, "path");
            line.setAttribute("d", `M${iconSize / 2} ${iconSize * 0.667}V${iconSize * 0.5}`);
            line.setAttribute("stroke", "currentColor");
            line.setAttribute("stroke-width", "1.5");
            line.setAttribute("stroke-linecap", "round");
            line.setAttribute("fill", "none");
            g.appendChild(line);

            const dot = document.createElementNS(SVG_NS, "circle");
            dot.setAttribute("cx", (iconSize / 2).toString());
            dot.setAttribute("cy", (iconSize * 0.333).toString());
            dot.setAttribute("r", "0.75");
            dot.setAttribute("fill", "currentColor");
            g.appendChild(dot);

            const hitArea = document.createElementNS(SVG_NS, "circle");
            hitArea.setAttribute("cx", (iconSize / 2).toString());
            hitArea.setAttribute("cy", (iconSize / 2).toString());
            hitArea.setAttribute("r", (iconSize / 2 + 4).toString());
            hitArea.setAttribute("fill", "transparent");
            g.appendChild(hitArea);

            const handler = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                isDragging = false;
                onHexNoteClick(hexCoord);
            };
            g.addEventListener("click", handler);
            boundHandlers.push([g, "click", handler as EventListener, undefined]);

            indicatorGroup.appendChild(g);
        }

        svgDomElement.appendChild(indicatorGroup);
    }

    function attachHexLinkHandlers(
        containerEl: HTMLElement,
        links: Record<string, string>,
        onHexClick: HexClickHandler,
    ) {
        if (!parser.value) return;
        const coordGroupId = parser.value.options.global
            ? "coordinates"
            : `coordinates-${parser.value.id}`;
        const coordGroup = containerEl.querySelector(`#${coordGroupId}`);
        if (!coordGroup) return;

        const textEls = coordGroup.querySelectorAll("text");
        for (const textEl of textEls) {
            const rawCoord = (textEl.textContent || "").trim();
            const digits = rawCoord.replace(/[^0-9]/g, "");
            if (digits.length < 4) continue;
            const coordKey = digits.slice(0, 4);

            const hasLink = coordKey in links;

            textEl.classList.add("text-mapper-clickable");
            if (hasLink) {
                textEl.setAttribute("fill", "var(--interactive-accent, #0969da)");
                textEl.setAttribute("text-decoration", "underline");
            }

            const handler = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                isDragging = false;
                onHexClick(coordKey);
            };
            textEl.addEventListener("click", handler);
            boundHandlers.push([textEl, "click", handler as EventListener, undefined]);
        }
    }

    function updateLinkStyles(containerEl: HTMLElement, links: Record<string, string>) {
        if (!parser.value) return;
        const coordGroupId = parser.value.options.global
            ? "coordinates"
            : `coordinates-${parser.value.id}`;
        const coordGroup = containerEl.querySelector(`#${coordGroupId}`);
        if (!coordGroup) return;

        const textEls = coordGroup.querySelectorAll("text");
        for (const textEl of textEls) {
            const rawCoord = (textEl.textContent || "").trim();
            const digits = rawCoord.replace(/[^0-9]/g, "");
            if (digits.length < 4) continue;
            const coordKey = digits.slice(0, 4);
            const hasLink = coordKey in links;
            if (hasLink) {
                textEl.setAttribute("fill", "var(--interactive-accent, #0969da)");
                textEl.setAttribute("text-decoration", "underline");
            } else {
                textEl.removeAttribute("fill");
                textEl.removeAttribute("text-decoration");
            }
        }
    }

    return {
        parser,
        factionOverlaysVisible,
        render,
        attachHexLinkHandlers,
        updateLinkStyles,
        attachHexNoteIndicators,
        cleanup,
        recenter,
        centerOnHex,
        exportPng,
        toggleFactionOverlays,
    };
}
