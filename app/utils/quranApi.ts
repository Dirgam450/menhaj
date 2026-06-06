export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

// Fetch list of all 114 surahs
export async function fetchSurahs(): Promise<Surah[]> {
  try {
    const res = await fetch('https://api.alquran.cloud/v1/surah');
    const data = await res.json();
    if (data && data.code === 200) {
      return data.data;
    }
    throw new Error('فشل جلب السور من API');
  } catch (e) {
    console.error(e);
    // Fallback to minimal static list in case of network failure
    return [
      { number: 1, name: "الفاتحة", englishName: "Al-Fatihah", englishNameTranslation: "The Opening", numberOfAyahs: 7, revelationType: "Meccan" },
      { number: 2, name: "البقرة", englishName: "Al-Baqarah", englishNameTranslation: "The Cow", numberOfAyahs: 286, revelationType: "Medinan" },
      { number: 3, name: "آل عمران", englishName: "Al-Imran", englishNameTranslation: "The Family of Imran", numberOfAyahs: 200, revelationType: "Medinan" },
      { number: 36, name: "يس", englishName: "Ya-Sin", englishNameTranslation: "Ya Sin", numberOfAyahs: 83, revelationType: "Meccan" },
      { number: 112, name: "الإخلاص", englishName: "Al-Ikhlas", englishNameTranslation: "Sincerity", numberOfAyahs: 4, revelationType: "Meccan" },
      { number: 113, name: "الفلق", englishName: "Al-Falaq", englishNameTranslation: "The Daybreak", numberOfAyahs: 5, revelationType: "Meccan" },
      { number: 114, name: "الناس", englishName: "An-Nas", englishNameTranslation: "Mankind", numberOfAyahs: 6, revelationType: "Meccan" }
    ];
  }
}

// Fetch verse text and tafsir Jalalayn
export async function fetchVerse(surahNumber: number, verseNumber: number): Promise<{ text: string; tafsir: string }> {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surahNumber}:${verseNumber}/editions/quran-simple-clean,ar.jalalayn`);
    const data = await res.json();
    if (data && data.code === 200 && data.data.length === 2) {
      return {
        text: data.data[0].text,
        tafsir: data.data[1].text
      };
    }
    throw new Error('فشل جلب الآية والتفسير');
  } catch (e) {
    console.error(e);
    return {
      text: 'فشل جلب نص الآية من الخادم السحابي. يرجى مراجعة اتصال الإنترنت الخاص بك.',
      tafsir: 'فشل جلب التفسير.'
    };
  }
}
