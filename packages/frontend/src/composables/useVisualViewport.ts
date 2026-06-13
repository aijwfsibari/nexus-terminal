import { ref, watch, onMounted, onUnmounted, onActivated, onDeactivated, type Ref } from 'vue';

/**
 * 监听 visualViewport，解决 Firefox 移动端软键盘弹出时
 * fixed 定位元素被键盘遮挡的问题。
 *
 * === 核心问题 ===
 * 在移动端 Firefox 中，只要页面里任何一个元素（终端 xterm 画布、
 * 弹窗、Toast 通知、右键菜单……任何一个都行）在某一时刻的渲染尺寸
 * 或定位超出了手机屏幕宽/高，`<html>`/`<body>` 的"文档尺寸"
 * 就会被撑大，浏览器的"布局视口 (layout viewport)"也会随之被撑宽/撑高，
 * 整个页面会被缩小显示（可以双指捏合放大看到一个"桌面尺寸"的区域）。
 *
 * 一旦布局视口被撑大，**之后所有**使用 100vw / 100vh / 100% / vw / vh /
 * fixed 定位的元素（不止是 SSH 终端相关的浮窗，还包括各种全局 Toast、
 * 右键菜单、下拉菜单等），都会按这个被撑大的"桌面尺寸"布局视口来计算
 * 尺寸和位置，于是表现为"电脑版"的大窗口/通知，且需要双指捏合缩小
 * 才能看到。
 *
 * === 解决方案 ===
 * 不再逐个修复每一个浮窗/通知组件，而是从根上锁死整个文档
 * （<html> 与 <body>）的渲染尺寸，使其始终等于
 * window.visualViewport 反映的"真实可见视口"大小，并设置
 * overflow: hidden，禁止文档被任何子元素撑大。
 * 这样布局视口永远等于手机屏幕大小，所有基于 vw/vh/100%/fixed
 * 的浮窗、通知、菜单都会自动按手机屏幕大小显示，无需双指捏合，
 * 也无需逐个适配。
 *
 * === keep-alive 兼容 ===
 * 如果 /workspace 路由被外层 <keep-alive> 缓存（切换到【仪表盘】/【设置】
 * 标签页时本组件并不会真正卸载，只是被"停用"），仅靠 onUnmounted
 * 是无法移除文档锁定的——会导致切回仪表盘/设置后整页无法上下滑动，
 * 必须刷新页面才能恢复。
 * 因此这里同时监听 onActivated / onDeactivated：
 *  - 进入/激活终端页时加锁；
 *  - 离开/停用终端页（包括被 keep-alive 缓存）时立即解锁，
 *    把 <html>/<body> 还原成正常样式，保证仪表盘/设置页可以正常滚动。
 *
 * 同时仍然将视口宽高、以及视口相对于布局视口的偏移量
 * （offsetLeft/offsetTop，用于兼容极少数仍可能发生缩放/平移的情况）
 * 同步到 CSS 变量 --visual-viewport-width / height / left / top 上，
 * 供需要的浮窗作为兜底使用。
 *
 * @param lockDocumentSize 是否启用"锁死文档尺寸"。通常传入
 *   `isMobile`（一个响应式 ref），表示仅在移动端启用该锁定，
 *   桌面端保持浏览器原生行为不变。
 */
export function useVisualViewport(lockDocumentSize?: Ref<boolean> | boolean) {
  const keyboardHeight = ref(0);
  const isKeyboardOpen = ref(false);

  // 组件当前是否处于"激活"状态（未被 keep-alive 停用）
  const isComponentActive = ref(true);

  const isLockEnabled = (): boolean => {
    if (!isComponentActive.value) return false;
    if (lockDocumentSize === undefined) return false;
    return typeof lockDocumentSize === 'boolean' ? lockDocumentSize : lockDocumentSize.value;
  };

  // 应用/移除文档尺寸锁定
  const applyDocumentLock = (vvWidth: number, vvHeight: number) => {
    if (isLockEnabled()) {
      const htmlStyle = document.documentElement.style;
      const bodyStyle = document.body.style;

      // 用 !important 强制锁死，防止任何子元素（终端/弹窗/通知）撑大文档
      htmlStyle.setProperty('width', `${vvWidth}px`, 'important');
      htmlStyle.setProperty('height', `${vvHeight}px`, 'important');
      htmlStyle.setProperty('max-width', `${vvWidth}px`, 'important');
      htmlStyle.setProperty('max-height', `${vvHeight}px`, 'important');
      htmlStyle.setProperty('overflow', 'hidden', 'important');

      bodyStyle.setProperty('width', `${vvWidth}px`, 'important');
      bodyStyle.setProperty('height', `${vvHeight}px`, 'important');
      bodyStyle.setProperty('max-width', `${vvWidth}px`, 'important');
      bodyStyle.setProperty('max-height', `${vvHeight}px`, 'important');
      bodyStyle.setProperty('overflow', 'hidden', 'important');
      bodyStyle.setProperty('position', 'fixed', 'important');
      bodyStyle.setProperty('top', '0', 'important');
      bodyStyle.setProperty('left', '0', 'important');
    } else {
      removeDocumentLock();
    }
  };

  const removeDocumentLock = () => {
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;

    htmlStyle.removeProperty('width');
    htmlStyle.removeProperty('height');
    htmlStyle.removeProperty('max-width');
    htmlStyle.removeProperty('max-height');
    htmlStyle.removeProperty('overflow');

    bodyStyle.removeProperty('width');
    bodyStyle.removeProperty('height');
    bodyStyle.removeProperty('max-width');
    bodyStyle.removeProperty('max-height');
    bodyStyle.removeProperty('overflow');
    bodyStyle.removeProperty('position');
    bodyStyle.removeProperty('top');
    bodyStyle.removeProperty('left');
  };

  const update = () => {
    const vv = window.visualViewport;

    // 视口尺寸：优先使用 visualViewport，回退到 window.innerWidth/Height
    const vvWidth = vv ? Math.round(vv.width) : window.innerWidth;
    const vvHeight = vv ? Math.round(vv.height) : window.innerHeight;

    // 视口相对于布局视口的偏移量（兜底用）
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

    // --- 同步 CSS 变量（兜底，供单个浮窗使用） ---
    const root = document.documentElement.style;
    root.setProperty('--visual-viewport-height', `${vvHeight}px`);
    root.setProperty('--visual-viewport-width', `${vvWidth}px`);
    root.setProperty('--visual-viewport-left', `${vvLeft}px`);
    root.setProperty('--visual-viewport-top', `${vvTop}px`);

    // --- 锁死文档尺寸（核心修复，仅在组件激活且 lockDocumentSize 为 true 时生效） ---
    applyDocumentLock(vvWidth, vvHeight);
  };

  let stopWatchLock: (() => void) | null = null;

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
    } else {
      window.addEventListener('resize', update);
    }

    isComponentActive.value = true;
    update();

    // 如果 lockDocumentSize 是响应式 ref，监听其变化（例如设备旋转、
    // 窗口尺寸跨越移动端/桌面端断点时），动态加锁/解锁
    if (lockDocumentSize !== undefined && typeof lockDocumentSize !== 'boolean') {
      stopWatchLock = watch(lockDocumentSize, () => {
        update();
      });
    }
  });

  // +++ keep-alive 兼容：组件被缓存而不是真正卸载时触发 +++
  onActivated(() => {
    isComponentActive.value = true;
    update();
  });

  onDeactivated(() => {
    isComponentActive.value = false;
    // 立即解锁，确保切换到的其他页面（仪表盘/设置）可以正常滚动
    removeDocumentLock();
  });

  onUnmounted(() => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    } else {
      window.removeEventListener('resize', update);
    }
    if (stopWatchLock) {
      stopWatchLock();
    }
    isComponentActive.value = false;
    // 组件卸载时务必恢复文档原始样式，避免影响其他视图
    removeDocumentLock();
  });

  return { keyboardHeight, isKeyboardOpen };
}
