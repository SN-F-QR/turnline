// Adapted-from: https://github.com/dezhonger/scroll/commit/c6ae88064ffd1f4d0d6c0fa17822cc23959e6f7a
type HeadingOutlineInput = {
    text: string;
    tagName: string;
};

const CHINESE_SECTION_PREFIX = /^(?:第[一二三四五六七八九十百零〇两]+[章节部分篇]|[一二三四五六七八九十百零〇两]+)[、.．]\s*/;
const ARABIC_LIST_PREFIX = /^(\d+)[.)、．]\s+/;

const getRawHeadingLevel = (tagName: string) => {
    const match = tagName.match(/^H([1-6])$/i);
    return match ? Number(match[1]) : 6;
};

const getArabicListNumber = (text: string) => {
    const match = text.trim().match(ARABIC_LIST_PREFIX);
    return match ? Number(match[1]) : null;
};

const isIncreasingNumberedRun = (numbers: number[]) => (
    numbers.length >= 2 &&
    numbers[0] === 1 &&
    numbers.every((number, index) => index === 0 || number > numbers[index - 1])
);

/**
 * ChatGPT occasionally emits inconsistent Markdown heading markers inside an
 * otherwise clearly numbered outline. Keep ordinary responses literal, but
 * repair the two unambiguous signals used by these structured answers:
 *
 * - Chinese chapter labels (一、二、三…) are sibling top-level sections.
 * - A consecutive 1., 2., 3. run inside one chapter is one sibling level,
 *   using the first item's level as the intended depth.
 */
export const inferChatGptOutlineLevels = (headings: HeadingOutlineInput[]) => {
    const levels = headings.map((heading) => getRawHeadingLevel(heading.tagName));
    const chapterIndexes = headings
        .map((heading, index) => CHINESE_SECTION_PREFIX.test(heading.text.trim()) ? index : -1)
        .filter((index) => index >= 0);

    // One matching title may be ordinary prose. Multiple numbered chapters
    // provide enough evidence that this response has a semantic outline.
    if (chapterIndexes.length < 2) return levels;

    chapterIndexes.forEach((chapterIndex) => {
        levels[chapterIndex] = 1;
    });

    chapterIndexes.forEach((chapterIndex, chapterPosition) => {
        const segmentEnd = chapterIndexes[chapterPosition + 1] ?? headings.length;
        let index = chapterIndex + 1;

        while (index < segmentEnd) {
            if (getArabicListNumber(headings[index].text) === null) {
                index += 1;
                continue;
            }

            const runStart = index;
            const numbers: number[] = [];
            while (index < segmentEnd) {
                const number = getArabicListNumber(headings[index].text);
                if (number === null) break;
                numbers.push(number);
                index += 1;
            }

            if (!isIncreasingNumberedRun(numbers)) continue;

            const intendedLevel = Math.max(2, levels[runStart]);
            for (let runIndex = runStart; runIndex < index; runIndex += 1) {
                levels[runIndex] = intendedLevel;
            }
        }
    });

    return levels;
};
