import { Component } from '@theme/component';
import { debounce } from '@theme/utilities';

const ANIMATION_OPTIONS = {
  duration: 500,
};

/**
 * A custom element that displays a marquee.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} wrapper - The wrapper element.
 * @property {HTMLElement} content - The content element.
 * @property {HTMLElement[]} marqueeItems - The marquee items collection.
 *
 * @extends Component<Refs>
 */
class MarqueeComponent extends Component {
  requiredRefs = ['wrapper', 'content', 'marqueeItems'];

  async connectedCallback() {
    super.connectedCallback();

    const { marqueeItems } = this.refs;
    if (marqueeItems.length === 0) return;

    const { numberOfCopies } = await this.#queryNumberOfCopies();

    const speed = this.#calculateSpeed(numberOfCopies);

    this.#addRepeatedItems(numberOfCopies);
    this.#duplicateContent();

    this.#setSpeed(speed);
    this.#restartAnimation();

    this.#resizeObserver = new ResizeObserver(this.#handleResize);
    this.#resizeObserver.observe(this);

    if (this.#canHover.matches) {
      this.addEventListener('pointerenter', this.#slowDown);
      this.addEventListener('pointerleave', this.#speedUp);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver?.disconnect();
    this.removeEventListener('pointerenter', this.#slowDown);
    this.removeEventListener('pointerleave', this.#speedUp);
  }

  /**
   * @type {{ cancel: () => void, current: number } | null}
   */
  #animation = null;

  /**
   * @type {number | null}
   */
  #marqueeWidth = null;

  /**
   * @type {ResizeObserver | null}
   */
  #resizeObserver = null;

  #canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  #slowDown = debounce(() => {
    if (!this.#canHover.matches) return;
    if (this.#animation) return;

    const animation = this.refs.wrapper.getAnimations()[0];

    if (!animation) return;

    this.#animation = animateValue({
      ...ANIMATION_OPTIONS,
      from: 1,
      to: 0,
      onUpdate: (value) => animation.updatePlaybackRate(value),
      onComplete: () => {
        this.#animation = null;
      },
    });
  }, ANIMATION_OPTIONS.duration);

  #speedUp() {
    this.#slowDown.cancel();

    const animation = this.refs.wrapper.getAnimations()[0];

    if (!animation || animation.playbackRate === 1) return;

    const from = this.#animation?.current ?? 0;
    this.#animation?.cancel();

    this.#animation = animateValue({
      ...ANIMATION_OPTIONS,
      from,
      to: 1,
      onUpdate: (value) => animation.updatePlaybackRate(value),
      onComplete: () => {
        this.#animation = null;
      },
    });
  }

  get clonedContent() {
    const { content, wrapper } = this.refs;
    const lastChild = wrapper.lastElementChild;

    return content !== lastChild ? lastChild : null;
  }

  /**
   * @param {number} value
   */
  #setSpeed(value) {
    const speedFactor = Number(this.getAttribute('data-speed-factor')) || 25;
    const speed = Number.isFinite(value) && value > 0 ? value : speedFactor;
    this.style.setProperty('--marquee-speed', `${speed}s`);
  }

  async #queryNumberOfCopies() {
    const { marqueeItems } = this.refs;
    const item = marqueeItems[0];

    if (!item) {
      return { numberOfCopies: 1, isHorizontalResize: true };
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const width = this.clientWidth || this.getBoundingClientRect().width;
    const itemsWidth = item.scrollWidth || item.getBoundingClientRect().width;
    const isHorizontalResize = this.#marqueeWidth !== width;
    this.#marqueeWidth = width;

    return {
      numberOfCopies: !width || !itemsWidth ? 1 : Math.max(1, Math.ceil(width / itemsWidth)),
      isHorizontalResize,
    };
  }

  /**
   * @param {number} numberOfCopies
   */
  #calculateSpeed(numberOfCopies) {
    const speedFactor = Number(this.getAttribute('data-speed-factor')) || 25;
    const copies = Number.isFinite(numberOfCopies) && numberOfCopies > 0 ? numberOfCopies : 1;

    return Math.sqrt(copies) * speedFactor;
  }

  #handleResize = debounce(async () => {
    const { marqueeItems } = this.refs;
    const { numberOfCopies, isHorizontalResize } = await this.#queryNumberOfCopies();

    // opt out of marquee manipulation on vertical resizes
    if (!isHorizontalResize) return;

    const currentNumberOfCopies = marqueeItems.length;
    const speed = this.#calculateSpeed(numberOfCopies);

    if (numberOfCopies > currentNumberOfCopies) {
      this.#addRepeatedItems(numberOfCopies - currentNumberOfCopies);
    } else if (numberOfCopies < currentNumberOfCopies) {
      this.#removeRepeatedItems(currentNumberOfCopies - numberOfCopies);
    }

    this.#duplicateContent();
    this.#setSpeed(speed);
    this.#restartAnimation();
  }, 250);

  #restartAnimation() {
    const { wrapper } = this.refs;
    if (!wrapper) return;

    wrapper.style.animation = 'none';
    void wrapper.offsetWidth;
    wrapper.style.removeProperty('animation');
  }

  #duplicateContent() {
    this.clonedContent?.remove();

    const clone = /** @type {HTMLElement} */ (this.refs.content.cloneNode(true));

    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('ref');

    this.refs.wrapper.appendChild(clone);
  }

  /**
   * @param {number} numberOfCopies
   */
  #addRepeatedItems(numberOfCopies) {
    const { content, marqueeItems } = this.refs;

    if (!marqueeItems[0]) return;

    for (let i = 0; i < numberOfCopies - 1; i++) {
      const clone = marqueeItems[0].cloneNode(true);
      content.appendChild(clone);
    }
  }

  /**
   * @param {number} numberOfCopies
   */
  #removeRepeatedItems(numberOfCopies) {
    const { content } = this.refs;
    const children = Array.from(content.children);

    const itemsToRemove = Math.min(numberOfCopies, children.length - 1);

    for (let i = 0; i < itemsToRemove; i++) {
      content.lastElementChild?.remove();
    }
  }
}

// Define the animateValue function
/**
 * Animate a numeric property smoothly.
 * @param {Object} params - The parameters for the animation.
 * @param {number} params.from - The starting value.
 * @param {number} params.to - The ending value.
 * @param {number} params.duration - The duration of the animation in milliseconds.
 * @param {function(number): void} params.onUpdate - The function to call on each update.
 * @param {function(number): number} [params.easing] - The easing function.
 * @param {function(): void} [params.onComplete] - The function to call when the animation completes.
 */
function animateValue({ from, to, duration, onUpdate, easing = (t) => t * t * (3 - 2 * t), onComplete }) {
  const startTime = performance.now();
  let cancelled = false;
  let currentValue = from;

  /**
   * @param {number} currentTime - The current time in milliseconds.
   */
  function animate(currentTime) {
    if (cancelled) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);
    currentValue = from + (to - from) * easedProgress;

    onUpdate(currentValue);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else if (typeof onComplete === 'function') {
      onComplete();
    }
  }

  requestAnimationFrame(animate);

  return {
    get current() {
      return currentValue;
    },
    cancel() {
      cancelled = true;
    },
  };
}

if (!customElements.get('marquee-component')) {
  customElements.define('marquee-component', MarqueeComponent);
}
