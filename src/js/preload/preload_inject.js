window.addEventListener('DOMContentLoaded', () => {
    const isLabs = window.location.hostname.includes('labs.perplexity.ai');
    const isMain = window.location.hostname.includes('perplexity.ai') && !isLabs;

    const mainSelectors = [
        'div.items-stretch.md\\:items-center.fill-mode-both.fixed.bottom-0.left-0.right-0.top-0.bg-backdrop\\/70.backdrop-blur-sm.animate-in.fade-in.ease-outExpo.duration-200',
        'div.max-w-\\[400px\\].overflow-hidden.rounded-xl.md\\:flex.md\\:max-w-\\[960px\\].border-borderMain\\/50',
        'relative.flex.flex-col.p-lg.md\\:w-\\[45\\%\\].md\\:p-xl',
        'md\\:h-\\[55\\%\\].md\\:w-\\[55\\%\\]',
        'rounded-lg.p-md.duration-300.ease-out.animate-in.fade-in.!p-lg.border-borderMain\\/50.ring-borderMain\\/50.divide-borderMain\\/50.dark\\:divide-borderMainDark\\/50.dark\\:ring-borderMainDark\\/50.dark\\:border-borderMainDark\\/50.bg-offset.dark\\:bg-offsetDark',
        
    ];

    const labsSelectors = [
        'div.flex.items-center.gap-sm'
    ];

    function removeNagScreens(selectors) {
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                el.remove();
            });
        });
    }

    if (isLabs) {
        removeNagScreens(labsSelectors);
    } else if (isMain) {
        removeNagScreens(mainSelectors);
    }

    const observer = new MutationObserver(() => {
        if (isLabs) {
            removeNagScreens(labsSelectors);
        } else if (isMain) {
            removeNagScreens(mainSelectors);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
});
