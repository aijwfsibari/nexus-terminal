import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 监听 visualViewport，解决 Firefox 移动端软键盘弹出时
 * fixed 定位元素被键盘遮挡的问题。
 * 同时更新 CSS 变量 --visual-viewport-height，
 * 供所有浮窗使用。
 */
export function useVisualViewport() {
  const keyboardHeight = ref(0);
  const isKeyboardOpen = ref(false);

  const update = () => {
    if (!window.visualViewport) return;
    const vvHeight = Math.round(window.visualViewport.height);
    const winHeight = window.innerHeight;
    const diff = winHeight - vvHeight;

    if (diff > 100) {
      keyboardHeight.value = diff;
      isKeyboardOpen.value = true;
    } else {
      keyboardHeight.value = 0;
      isKeyboardOpen.value = false;
    }

    // 设置 CSS 变量，供 fixed 浮窗使用
    document.documentElement.style.setProperty(
      '--visual-viewport-height',
      `${vvHeight}px`
    );
  };

  onMounted(() => {
    // 初始化默认值
    document.documentElement.style.setProperty(
      '--visual-viewport-height',
      `${window.innerHeight}px`
    );
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update);
      window.visualViewport.addEventListener('scroll', update);
      update();
    }
  });

  onUnmounted(() => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    }
  });

  return { keyboardHeight, isKeyboardOpen };
}
