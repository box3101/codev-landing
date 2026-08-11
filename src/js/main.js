/**
 * 스크롤 페이드인
 *
 * 판단 근거:
 * - CSS만으로 스크롤 진입을 감지할 수 없어 최소한의 JS를 쓴다.
 * - .js-reveal 클래스를 JS가 직접 붙인다. JS가 실패하거나 꺼져 있으면
 *   초기 opacity:0 규칙이 아예 적용되지 않아 콘텐츠가 항상 보인다.
 * - 한 번 보이면 관찰을 끊는다. 되감기 애니메이션은 요청 범위 밖이고 산만하다.
 * - 모션 최소화 설정을 켠 사용자에게는 애니메이션 자체를 붙이지 않는다.
 */
(function () {
  'use strict';

  var targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // IntersectionObserver 미지원 브라우저는 그냥 전부 보이게 둔다.
  if (reduced || !('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('js-reveal');

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    // 요소가 화면 아래에서 15% 정도 올라왔을 때 시작 — 너무 늦게 뜨는 느낌을 줄인다.
    { rootMargin: '0px 0px -15% 0px', threshold: 0 }
  );

  targets.forEach(function (el) {
    io.observe(el);
  });
})();
