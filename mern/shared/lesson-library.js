export const LESSON_PRICE_CENTS = 7500;
export const LESSON_BUNDLE_CENTS = 25000;
export const LESSON_INSTRUCTORS = ['David Northrop', 'Ashley Northrop', 'David and Ashley'];
export const lessonLibraryVisible = (config, user) => user?.role === 'owner' || config?.lessonLibrary?.open === true;
