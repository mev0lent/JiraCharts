import { toCanvas } from 'html-to-image';
import { appFonts, cssVar, DEFAULT_SANS_FONT } from './theme.js';

const DEFAULT_PADDING = 32;
const DEFAULT_PIXEL_RATIO = 3;
const CANVAS_READY_TIMEOUT = 1200;
const IMAGE_READY_TIMEOUT = 1200;
const SCREENSHOT_EXCLUDE_SELECTOR = '[data-screenshot-exclude]';
const FONT_LOAD_WEIGHTS = {
  sans: [400, 500, 600, 700, 800],
  mono: [300, 400, 500, 700],
};
const SCREENSHOT_SANS_SELECTOR = `
  .burndown-command-title,
  .burndown-command-top strong,
  .burndown-progress-anchors strong,
  .burndown-panel-value,
  .burndown-command-status strong,
  .card-value,
  .sprint-name,
  .issue-summary
`;
let fontCssCache = { key: null, promise: null };

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function includeScreenshotNode(node, filter) {
  if (node instanceof Element && node.matches(SCREENSHOT_EXCLUDE_SELECTOR)) {
    return false;
  }

  return filter ? filter(node) : true;
}

function hideExcludedNodes(node) {
  const elements = [
    ...(node instanceof Element && node.matches(SCREENSHOT_EXCLUDE_SELECTOR) ? [node] : []),
    ...Array.from(node.querySelectorAll(SCREENSHOT_EXCLUDE_SELECTOR)),
  ];

  if (!elements.length) return null;

  const previousDisplays = elements.map(element => ({
    element,
    display: element.style.getPropertyValue('display'),
    priority: element.style.getPropertyPriority('display'),
  }));

  elements.forEach(element => {
    element.style.setProperty('display', 'none', 'important');
  });

  return () => {
    previousDisplays.forEach(({ element, display, priority }) => {
      if (display) {
        element.style.setProperty('display', display, priority);
      } else {
        element.style.removeProperty('display');
      }
    });
  };
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nodeCaptureSize(node) {
  const style = getComputedStyle(node);
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;

  return {
    width: node.clientWidth + borderLeft + borderRight,
    height: node.clientHeight + borderTop + borderBottom,
  };
}

function isCanvasBlank(canvas) {
  if (!canvas.width || !canvas.height) return true;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;

    for (let index = 3; index < imageData.length; index += 4) {
      if (imageData[index] !== 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function waitForCanvasReady(canvas) {
  const deadline = performance.now() + CANVAS_READY_TIMEOUT;

  while (performance.now() < deadline) {
    await nextFrame();
    await nextFrame();

    if (canvas.clientWidth > 0 && canvas.clientHeight > 0 && !isCanvasBlank(canvas)) {
      return;
    }
  }
}

async function waitForImageReady(image) {
  if (image.decode) {
    try {
      await Promise.race([
        image.decode(),
        wait(IMAGE_READY_TIMEOUT),
      ]);
    } catch {
      // Fall back to load/paint checks below. Safari may reject decode() for
      // freshly-created data URLs even though the image is still usable.
    }
  }

  if (!image.complete || image.naturalWidth === 0) {
    await Promise.race([
      new Promise(resolve => {
        image.onload = resolve;
        image.onerror = resolve;
      }),
      wait(IMAGE_READY_TIMEOUT),
    ]);
  }

  await nextFrame();
  await nextFrame();
}

function canvasImage(canvas) {
  const image = document.createElement('img');
  image.src = canvas.toDataURL('image/png');
  image.width = canvas.clientWidth || canvas.width;
  image.height = canvas.clientHeight || canvas.height;
  image.className = canvas.className;
  image.setAttribute('role', canvas.getAttribute('role') || 'img');
  image.setAttribute('aria-label', canvas.getAttribute('aria-label') || '');
  image.style.cssText = canvas.style.cssText;
  image.style.display = getComputedStyle(canvas).display || 'block';
  image.style.width = `${canvas.clientWidth || canvas.width}px`;
  image.style.height = `${canvas.clientHeight || canvas.height}px`;
  return image;
}

function canvasSnapshots(node) {
  const nodeRect = node.getBoundingClientRect();

  return Array.from(node.querySelectorAll('canvas'))
    .map(canvas => {
      const rect = canvas.getBoundingClientRect();

      return {
        canvas,
        left: rect.left - nodeRect.left,
        top: rect.top - nodeRect.top,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter(({ canvas, width, height }) => (
      canvas.width > 0 &&
      canvas.height > 0 &&
      width > 0 &&
      height > 0
    ));
}

function drawCanvasSnapshots(targetCanvas, snapshots, captureSize) {
  if (!snapshots.length || !captureSize.width || !captureSize.height) return;

  const context = targetCanvas.getContext('2d');
  if (!context) return;

  const scaleX = targetCanvas.width / captureSize.width;
  const scaleY = targetCanvas.height / captureSize.height;

  snapshots.forEach(({ canvas, left, top, width, height }) => {
    context.drawImage(
      canvas,
      left * scaleX,
      top * scaleY,
      width * scaleX,
      height * scaleY,
    );
  });
}

async function readyCanvases(node) {
  const canvases = Array.from(node.querySelectorAll('canvas'));
  await Promise.all(canvases.map(waitForCanvasReady));
  return canvases;
}

async function withCanvasImages(canvases, callback) {
  const replacements = canvases.map(canvas => {
    const image = canvasImage(canvas);
    canvas.replaceWith(image);
    return { canvas, image };
  });

  try {
    await Promise.all(replacements.map(({ image }) => waitForImageReady(image)));
    return await callback();
  } finally {
    replacements.forEach(({ canvas, image }) => {
      image.replaceWith(canvas);
    });
  }
}

async function loadAppFonts() {
  const fonts = appFonts();
  await document.fonts?.ready;
  await Promise.all([
    ...FONT_LOAD_WEIGHTS.sans.map(weight => document.fonts?.load(`${weight} 14px ${fonts.sans}`)),
    ...FONT_LOAD_WEIGHTS.mono.map(weight => document.fonts?.load(`${weight} 14px ${fonts.mono}`)),
  ].filter(Boolean));
  await document.fonts?.ready;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function inlineCssUrls(cssText, baseUrl) {
  const urls = [...new Set(
    Array.from(cssText.matchAll(/url\((['"]?)([^'")]+)\1\)/g), match => match[2]),
  )];
  let inlinedCss = cssText;

  await Promise.all(urls.map(async url => {
    const absoluteUrl = new URL(url, baseUrl).href;
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error(`Font konnte nicht geladen werden: ${absoluteUrl}`);
    const dataUrl = await blobToDataUrl(await response.blob());
    inlinedCss = inlinedCss.replaceAll(url, dataUrl);
  }));

  return inlinedCss;
}

function fontStylesheetLinks() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
}

function screenshotFontOverrideCss() {
  const { sans } = appFonts();
  return `
    ${SCREENSHOT_SANS_SELECTOR} {
      font-family: ${sans} !important;
    }
  `;
}

async function screenshotFontCss() {
  const { sans, mono } = appFonts();
  const links = fontStylesheetLinks();
  const key = JSON.stringify({
    hrefs: links.map(link => link.href),
    sans,
    mono,
  });

  if (fontCssCache.key !== key || !fontCssCache.promise) {
    fontCssCache = {
      key,
      promise: Promise.all(
        links.map(async link => {
          try {
            const response = await fetch(link.href);
            if (!response.ok) throw new Error(`Font-CSS konnte nicht geladen werden: ${link.href}`);
            return inlineCssUrls(await response.text(), link.href);
          } catch {
            return '';
          }
        }),
      )
        .then(cssBlocks => `${cssBlocks.filter(Boolean).join('\n')}\n${screenshotFontOverrideCss()}`)
        .catch(() => screenshotFontOverrideCss()),
    };
  }

  return fontCssCache.promise;
}

export async function exportNodeAsPng(node, filename, options = {}) {
  if (!node) return;

  await loadAppFonts();
  await nextFrame();
  await nextFrame();

  const restoreExcludedNodes = hideExcludedNodes(node);

  try {
    if (restoreExcludedNodes) {
      await nextFrame();
      await nextFrame();
    }

    const padding = options.padding ?? DEFAULT_PADDING;
    const pixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
    const backgroundColor = options.backgroundColor ?? cssVar('--surface', '#ffffff');
    const fontEmbedCSS = await screenshotFontCss();
    const fonts = appFonts();
    const canvases = await readyCanvases(node);
    const captureSize = nodeCaptureSize(node);
    const snapshots = canvasSnapshots(node);
    const canvas = await withCanvasImages(canvases, () =>
      toCanvas(node, {
        backgroundColor,
        cacheBust: true,
        filter: childNode => includeScreenshotNode(childNode, options.filter),
        fontEmbedCSS,
        pixelRatio,
        preferredFontFormat: 'woff2',
        style: {
          fontFamily: fonts.sans || DEFAULT_SANS_FONT,
        },
      }));
    drawCanvasSnapshots(canvas, snapshots, captureSize);

    const paddedCanvas = document.createElement('canvas');
    const paddingPx = padding * pixelRatio;
    paddedCanvas.width = canvas.width + paddingPx * 2;
    paddedCanvas.height = canvas.height + paddingPx * 2;

    const context = paddedCanvas.getContext('2d');
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
    context.drawImage(canvas, paddingPx, paddingPx);

    downloadDataUrl(paddedCanvas.toDataURL('image/png'), filename);
  } finally {
    restoreExcludedNodes?.();
  }
}
