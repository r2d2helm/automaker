## Summary

I've implemented the requested feature. Here's what was changed:

### Changes Made to `apps/app/src/components/ui/course-promo-badge.tsx`:

1. **Removed the modal dialog completely** - The `Dialog` component and all its sub-components (`DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`) along with the modal state (`open`) have been removed.

2. **Changed from button to direct link** - The `<button>` element that triggered the modal has been replaced with an `<a>` anchor tag that links directly to `https://agenticjumpstart.com`.

3. **Simplified imports** - Removed unused imports:
   - Removed: `Rocket`, `ExternalLink`, `Code`, `MessageSquare`, `Brain`, `Terminal` from lucide-react
   - Removed: All Dialog-related imports from `./dialog`
   - Removed: `Button` import
   - Kept: `Sparkles` and `X` (still needed for the badge UI)

4. **Added proper link attributes** - Added `target="_blank"` to open in a new tab and `rel="noopener noreferrer"` for security best practices.

5. **Updated dismiss button** - Added `e.preventDefault()` to the dismiss button's click handler to prevent the link from being followed when clicking the X to dismiss the badge.

### Behavior:
- **Before**: Clicking "Become a 10x Dev" opened a modal dialog with course information and a "Get Started" button that opened the site
- **After**: Clicking "Become a 10x Dev" navigates directly to `https://agenticjumpstart.com` in a new tab
- The dismiss (X) button functionality remains unchanged - clicking it hides the badge

### Notes for Developer:
- The TypeScript error shown during build check is unrelated to this change (it's in `use-auto-mode.ts` file and was pre-existing)
- The component is now significantly simpler with less code to maintain
- No tests were found specifically for this component, so no test updates were needed