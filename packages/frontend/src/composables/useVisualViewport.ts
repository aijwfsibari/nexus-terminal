import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 监听 visualViewport，解决 Firefox 移动端软键盘弹出时
 * fixed 定位元素被键盘遮挡的问题。
 *
 * 同时，当页面内容（例如 SSH 终端）在横向上超出屏幕宽度时，
 * Firefox 移动端会把"布局视口 (layout viewport)"撑宽并整体缩放显示页面，
 * 这会导致使用 100vw / inset-x-0 / w-full 的浮窗按照被撑宽后的
 * 布局视口计算尺寸和位置，从而表现为"电脑版浮窗"溢出屏幕。
 *
 * window.visualViewport 始终反映用户真实可见的视口（宽度、高度、
 * 以及相对于布局视口的偏移量 offsetLeft/offsetTop），不受内容横向溢出影响。
 * 这里将其同步到 CSS 变量上，供所有浮窗统一使用，
 * 以保证浮窗始终按照"手机版"（即真实可见视口）显示，不会溢出屏幕。
 */
export function useVisualViewport() {
  const keyboardHeight = ref(0);
  const isKeyboardOpen = ref(false);

  const update = () => {
    const vv = window.visualViewport;

    // 视口尺寸：优先使用 visualViewport，回退到 window.innerWidth/Height
    const vvWidth = vv ? Math.round(vv.width) : window.innerWidth;
    const vvHeight = vv ? Math.round(vv.height) : window.innerHeight;

    // 视口相对于布局视口的偏移量（页面被横向/纵向撑宽并缩放时会非 0）
    const vvLeft = vv ? Math.round(vv.offsetLeft) : 0;
    const vvTop = vv ? Math.round(vv.offsetTop) : 0;

    // --- 软键盘检测（保持原逻辑） ---
    const winHeight = window.innerHeight;
    const diff = winHeight - vvHeight;

    if (diff > 100) {
      keyboardHeight.value = diff;
      isKeyboardOpen.value = true;
    } else {
      keyboardHeight.value = 0;
      isKeyboardOpen.value = false;
    }

    // --- 同步 CSS 变量，供所有浮窗统一使用 ---
    const root = document.documentElement.style;
    root.setProperty('--visual-viewport-height', `${vvHeight}px`);
    root.setProperty('--visual-viewport-width', `${vvWidth}px`);
    root.setProperty('--visual-viewport-left', `${vvLeft}px`);
    root.setProperty('--visual-viewport-top', `${vvTop}px`);
  };

  onMounted(() => {
    // 初始化默认值（确保在 visualViewport 不可用的环境下也有合理的回退值）
    const root = document.documentElement.style;
    root.setProperty('--visual-viewport-height', `${window.innerHeight}px`);
    root.setProperty('--visual-viewport-width', `${window.innerWidth}px`);
    root.setProperty('--visual-viewport-left', '0px');
    root.setProperty('--visual-viewport-top', '0px');

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update);
      window.visualViewport.addEventListener('scroll', update);
      update();
    } else {
      // 没有 visualViewport API 时，至少在窗口尺寸变化时更新一次
      window.addEventListener('resize', update);
      update();
    }
  });

  onUnmounted(() => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    } else {
      window.removeEventListener('resize', update);
    }
  });

  return { keyboardHeight, isKeyboardOpen };
}
