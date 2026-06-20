"use strict";

function bindGesturePanelControls() {
  document.querySelectorAll("[data-gesture-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const direction = button.dataset.gestureAction;
      if (!direction) return;
      if (state.playbackPaused) {
        state.playbackPaused = false;
        requestWakeLock();
      }
      if (typeof touchStudyActivity === "function") touchStudyActivity("gesture_" + String(direction || ""));
      triggerCardDirection(direction);
    });
  });
}


function bindCardGesture() {
  const stack = document.getElementById("cardStack");
  const card = document.getElementById("activeCard");
  if (!stack || !card) return;

  card.querySelectorAll("[data-card-tap]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.suppressNextCardClickPause) {
        state.suppressNextCardClickPause = false;
        return;
      }
      if (state.playbackPaused) {
        // 暂停态点击当前卡片只恢复播放，不触发左右切词或上下标记。
        resumePlayback();
        return;
      }
      triggerCardDirection(button.dataset.cardTap, card);
    });
  });

  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    if (state.suppressNextCardClickPause) {
      state.suppressNextCardClickPause = false;
      return;
    }
    if (state.playbackPaused) {
      resumePlayback();
      return;
    }
    pausePlaybackFromCard();
  });

  stack.addEventListener("pointerdown", (event) => {
    if (state.transitioning) return;
    if (state.playbackPaused) return;
    const interactiveTarget = event.target.closest("button, a, input, select, textarea");
    // 点击热区本身也允许作为滑动起点，否则从左右边缘起手的滑动会失效。
    if (interactiveTarget && !interactiveTarget.matches("[data-card-tap]")) return;
    clearTimers();
    if (typeof touchStudyActivity === "function") touchStudyActivity("pointer_down");
    stack.setPointerCapture(event.pointerId);
    state.pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      dx: 0,
      dy: 0
    };
    card.classList.remove("is-animated");
  });

  stack.addEventListener("pointermove", (event) => {
    if (!state.pointer || state.pointer.id !== event.pointerId) return;
    state.pointer.dx = event.clientX - state.pointer.startX;
    state.pointer.dy = event.clientY - state.pointer.startY;
    const rotate = state.pointer.dx / 28;
    updateCardSwipeFeedback(card, state.pointer.dx, state.pointer.dy);
    card.style.transform = `translate3d(${state.pointer.dx}px, ${state.pointer.dy}px, 0) rotate(${rotate}deg)`;
  });

  stack.addEventListener("pointerup", (event) => finishPointer(event, card));
  stack.addEventListener("pointercancel", (event) => finishPointer(event, card, true));
}


function finishPointer(event, card, cancelled = false) {
  if (!state.pointer || state.pointer.id !== event.pointerId) return;
  const { dx, dy, startTime } = state.pointer;
  state.pointer = null;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const threshold = clamp(minSide * 0.07, 34, 58);
  const elapsed = Math.max(1, performance.now() - startTime);
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  const velocity = distance / elapsed;
  const flick = distance > 24 && velocity > 0.42;
  const didSwipe = !cancelled && (distance >= threshold || flick);
  state.suppressNextCardClickPause = cancelled || didSwipe || distance > 6;

  if (!didSwipe) {
    snapBack(card);
    return;
  }

  triggerCardDirection(swipeDirectionFromDelta(dx, dy), card, { dx, dy });
}


function swipeDirectionFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}


function updateCardSwipeFeedback(card, dx, dy) {
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance < 14) {
    clearCardSwipeFeedback(card);
    return;
  }
  setCardSwipeFeedback(card, swipeDirectionFromDelta(dx, dy));
}


function setCardSwipeFeedback(card, direction) {
  clearCardSwipeFeedback(card);
  if (["left", "right", "up", "down"].includes(direction)) {
    card.classList.add(`is-swipe-${direction}`);
  }
}


function clearCardSwipeFeedback(card) {
  if (!card) return;
  card.classList.remove("is-swipe-left", "is-swipe-right", "is-swipe-up", "is-swipe-down");
}


function triggerCardDirection(direction, card = document.getElementById("activeCard"), offset = {}) {
  if (!card || state.playbackPaused) return;
  const action = cardActionFromDirection(direction);
  if (!action) {
    snapBack(card);
    return;
  }
  if (state.transitioning) {
    if (action === "next" || action === "previous") queueNavigationAction(action);
    return;
  }
  if (action === "unknown") {
    markUnknownInPlace(card);
    return;
  }
  clearTimers();
  card.classList.remove("is-animated");
  // 方向矩阵不要改反：
  // left swipe -> next，旧卡向左飞出；right swipe -> previous，旧卡向右飞出。
  // tap-left -> previous，旧卡向右飞出；tap-right -> next，旧卡向左飞出。
  const feedbackDirection = feedbackDirectionForAction(direction, action);
  setCardSwipeFeedback(card, feedbackDirection);
  const dx = Number(offset.dx) || 0;
  const dy = Number(offset.dy) || 0;
  if (action === "next") {
    const x = -window.innerWidth;
    startCardTransition();
    animateOut(card, x, dy, () => {
      finishCardTransition();
      advanceWord("manual");
    });
  } else if (action === "previous") {
    if (state.currentIndex <= 0) {
      snapBack(card);
    } else {
      const x = window.innerWidth;
      startCardTransition();
      animateOut(card, x, dy, () => {
        finishCardTransition();
        goPrevious();
      });
    }
  } else if (action === "known") {
    markCurrent("known");
    startCardTransition();
    animateOut(card, dx, -window.innerHeight, () => {
      finishCardTransition();
      advanceWord("known");
    });
  } else {
    snapBack(card);
  }
}


function cardActionFromDirection(direction) {
  if (direction === "left" || direction === "tap-right" || direction === "next") return "next";
  if (direction === "right" || direction === "tap-left" || direction === "previous") return "previous";
  if (direction === "up") return "known";
  if (direction === "down") return "unknown";
  return "";
}


function feedbackDirectionForAction(direction, action) {
  if (direction === "tap-left" || direction === "previous") return "right";
  if (direction === "tap-right" || direction === "next") return "left";
  if (action === "known") return "up";
  if (action === "unknown") return "down";
  return direction;
}


function queueNavigationAction(action) {
  if (action !== "next" && action !== "previous") return;
  state.navQueue.push(action);
  if (state.navQueue.length > 30) state.navQueue = state.navQueue.slice(-30);
}


function processNavigationQueueSoon() {
  if (!state.navQueue.length || state.transitioning || state.view !== "flash") return;
  addTimer(() => {
    if (!state.navQueue.length || state.transitioning || state.view !== "flash") return;
    const action = state.navQueue.shift();
    triggerCardDirection(action);
  }, 0);
}


