<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { quranData } from '../utils/quranData';
import { fetchSurahs, fetchVerse } from '../utils/quranApi';

// تحديد التصفح النشط
type FeedTab = 'all' | 'saved';
const activeTab = ref<FeedTab>('all');
const isMobileMenuOpen = ref(false);

// بيانات المستخدم والوضع الداكن
const userId = ref<string>('');
const authorName = ref<string>('طالب علم');
const isDarkMode = ref(false);
const currentUser = ref<any>(null);
const isPublisher = ref(false);

// صندوق كتابة الخاطرة الجديدة في الرئيسية
const newPostContent = ref('');
const isAttachingVerse = ref(false);
const attachedSurahId = ref(1);
const attachedVerseNumber = ref(1);
const showSuccessAlert = ref(false);

const isCustomVerse = ref(false);
const customSurahName = ref('');
const customVerseNumber = ref('');
const customVerseText = ref('');
const customVerseTafsir = ref('');

const apiSurahs = ref<any[]>([]);
const isLoadingVerseText = ref(false);
const apiVerseText = ref('');
const apiVerseTafsir = ref('');

const currentAttachedSurah = computed(() => {
  return apiSurahs.value.find(s => s.number === attachedSurahId.value) || apiSurahs.value[0];
});

const currentAttachedVersesCount = computed(() => {
  return currentAttachedSurah.value ? currentAttachedSurah.value.numberOfAyahs : 7;
});

const handleSurahChange = () => {
  attachedVerseNumber.value = 1;
};

const loadVerseTextFromApi = async () => {
  if (isCustomVerse.value) return;
  isLoadingVerseText.value = true;
  try {
    const { text, tafsir } = await fetchVerse(attachedSurahId.value, attachedVerseNumber.value);
    apiVerseText.value = text;
    apiVerseTafsir.value = tafsir;
  } catch (e) {
    console.error(e);
  } finally {
    isLoadingVerseText.value = false;
  }
};

watch([attachedSurahId, attachedVerseNumber], () => {
  loadVerseTextFromApi();
});

watch(isCustomVerse, (val) => {
  if (!val) {
    loadVerseTextFromApi();
  }
});

watch(isAttachingVerse, (val) => {
  if (val && !apiVerseText.value && !isCustomVerse.value) {
    loadVerseTextFromApi();
  }
});

// الإشعارات الحية وتنبيهات التوست
const isNotificationPermissionGranted = ref(false);
const activeToast = ref<any | null>(null);

const requestNotificationPermission = async () => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const permission = await Notification.requestPermission();
    isNotificationPermissionGranted.value = permission === 'granted';
  }
};

const triggerToast = (post: any) => {
  activeToast.value = post;
  setTimeout(() => {
    if (activeToast.value?.id === post.id) {
      activeToast.value = null;
    }
  }, 6000);
};

const showNotification = (post: any) => {
  triggerToast(post);
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('خاطرة قرآنية جديدة من ' + post.authorName, {
      body: post.content.substring(0, 100) + '...',
      icon: post.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorName}`,
      dir: 'rtl'
    });
  }
};

// التحكم بمودال النشر العائم
const isComposerModalOpen = ref(false);
const publishPostFromModal = async () => {
  await publishPost();
  isComposerModalOpen.value = false;
};

// المنشورات والإحصائيات والبحث
const posts = ref<any[]>([]);
const savedPostIds = ref<string[]>([]);
const visitorStats = ref({ total: 0, daily: 0 });
const searchQuery = ref('');
const activePostComments = ref<{ [key: string]: any[] }>({});
const openCommentsPostId = ref<string | null>(null);
const newCommentContent = ref<{ [key: string]: string }>({});
const isLoading = ref(true);

// اشتراكات فيربيس الحية
let unsubscribePosts: (() => void) | null = null;
const activeCommentsUnsubscribes: { [key: string]: () => void } = {};

// آية اليوم المتجددة
const dayOfMonth = new Date().getDate();
const indexOfTheDay = dayOfMonth % quranData.ayahsOfTheDay.length;
const ayahOfTheDay = quranData.ayahsOfTheDay[indexOfTheDay];

// المنشورات المعروضة بناءً على البحث والتبويب النشط
const filteredPosts = computed(() => {
  let list = [...posts.value];

  // فلترة حسب التبويب (كل المنشورات أو المحفوظة)
  if (activeTab.value === 'saved') {
    list = list.filter(p => savedPostIds.value.includes(p.id));
  }

  // فلترة حسب البحث
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    list = list.filter(p => 
      p.content.toLowerCase().includes(query) || 
      p.authorName.toLowerCase().includes(query) ||
      (p.verseRef && p.verseRef.text.toLowerCase().includes(query)) ||
      (p.verseRef && p.verseRef.tafsir.toLowerCase().includes(query))
    );
  }

  return list;
});

// دالة التحقق من تسجيل الدخول قبل أي تفاعل
const ensureAuth = async () => {
  if (!currentUser.value) {
    const { $firebase } = useNuxtApp();
    try {
      const user = await $firebase.loginWithGoogle();
      if (user) {
        currentUser.value = user;
        userId.value = user.uid;
        authorName.value = user.displayName || 'مستخدم جوجل';
        return true;
      }
      return false;
    } catch (e) {
      console.error("تسجيل الدخول بجوجل فشل:", e);
      return false;
    }
  }
  return true;
};

// تسجيل الدخول بجوجل يدوياً
const handleGoogleLogin = async () => {
  const { $firebase } = useNuxtApp();
  try {
    await $firebase.loginWithGoogle();
  } catch (e) {
    console.error("تسجيل الدخول فشل:", e);
  }
};

// تسجيل الخروج بجوجل يدوياً
const handleGoogleLogout = async () => {
  const { $firebase } = useNuxtApp();
  try {
    await $firebase.logout();
  } catch (e) {
    console.error("تسجيل الخروج فشل:", e);
  }
};

onMounted(async () => {
  // الوضع الداكن
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('menhaj_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      isDarkMode.value = true;
      document.body.classList.add('dark-mode');
    }

    // استرجاع الكاش المؤقت لعرض الخلاصة فوراً وبسرعة فائقة
    const cachedPosts = localStorage.getItem('menhaj_cached_posts');
    if (cachedPosts) {
      posts.value = JSON.parse(cachedPosts);
      isLoading.value = false;
    }
    
    // التحقق من صلاحية التنبيهات
    if ('Notification' in window) {
      isNotificationPermissionGranted.value = Notification.permission === 'granted';
    }
  }

  // جلب السور من الـ API
  apiSurahs.value = await fetchSurahs();

  // تحميل البيانات من السيرفر بالاشتراك الحي
  const { $firebase } = useNuxtApp();
  
  await loadStats();

  // الاشتراك بحالة تسجيل الدخول للمستخدم
  $firebase.onAuthChange(async (user) => {
    currentUser.value = user;
    if (user) {
      userId.value = user.uid;
      authorName.value = user.displayName || 'مستخدم جوجل';
      await $firebase.syncUserProfile(user);
      isPublisher.value = await $firebase.checkUserPublisherStatus(user.uid);
    } else {
      userId.value = '';
      authorName.value = 'طالب علم';
      isPublisher.value = false;
    }
    await loadSavedPosts();
  });

  // الاشتراك الحي للمنشورات لضمان التزامن الفوري
  unsubscribePosts = $firebase.subscribePosts((freshPosts) => {
    if (posts.value.length > 0 && freshPosts.length > posts.value.length) {
      const latestPost = freshPosts[0];
      if (latestPost.userId !== userId.value && !latestPost.isPending) {
        showNotification(latestPost);
      }
    }
    posts.value = freshPosts;
    isLoading.value = false;
    if (typeof window !== 'undefined') {
      localStorage.setItem('menhaj_cached_posts', JSON.stringify(freshPosts));
    }
  });
});

onUnmounted(() => {
  if (unsubscribePosts) unsubscribePosts();
  Object.values(activeCommentsUnsubscribes).forEach(unsub => unsub());
});

// جلب الإحصائيات
const loadStats = async () => {
  const { $firebase } = useNuxtApp();
  try {
    visitorStats.value = await $firebase.getVisitorStats();
  } catch (e) {
    console.error(e);
  }
};

// جلب المحفوظات
const loadSavedPosts = async () => {
  if (!userId.value) {
    savedPostIds.value = [];
    return;
  }
  const { $firebase } = useNuxtApp();
  try {
    savedPostIds.value = await $firebase.getSavedPostIds(userId.value);
  } catch (e) {
    console.error(e);
  }
};

// تفاعل الإعجاب
const pendingLikes = ref<{ [key: string]: boolean }>({});
const handleLike = async (postId: string) => {
  if (pendingLikes.value[postId]) return; // منع النقرات المتكررة أثناء المعالجة
  if (!(await ensureAuth())) return;
  
  pendingLikes.value[postId] = true;
  const { $firebase } = useNuxtApp();
  const post = posts.value.find(p => p.id === postId);
  if (!post) {
    pendingLikes.value[postId] = false;
    return;
  }

  // حفظ الحالة السابقة للرجوع إليها في حال حدوث فشل
  if (!post.likedBy) post.likedBy = [];
  const originallyLiked = post.likedBy.includes(userId.value);
  const originalLikesCount = post.likesCount || 0;

  // تحديث محلي فوري (Optimistic Update)
  const index = post.likedBy.indexOf(userId.value);
  if (index > -1) {
    post.likedBy.splice(index, 1);
    post.likesCount = Math.max(0, originalLikesCount - 1);
  } else {
    post.likedBy.push(userId.value);
    post.likesCount = originalLikesCount + 1;
  }

  try {
    await $firebase.toggleLikePost(postId, userId.value);
  } catch (e) {
    console.error("فشل تسجيل الإعجاب، تراجع عن التحديث التفاؤلي:", e);
    // تراجع عن التحديث
    if (originallyLiked) {
      if (!post.likedBy.includes(userId.value)) post.likedBy.push(userId.value);
    } else {
      const idx = post.likedBy.indexOf(userId.value);
      if (idx > -1) post.likedBy.splice(idx, 1);
    }
    post.likesCount = originalLikesCount;
  } finally {
    pendingLikes.value[postId] = false;
  }
};

// تفاعل حفظ التغريدة
const handleSave = async (postId: string) => {
  if (!(await ensureAuth())) return;
  const { $firebase } = useNuxtApp();
  try {
    await $firebase.toggleSavePost(userId.value, postId);
    const index = savedPostIds.value.indexOf(postId);
    if (index > -1) {
      savedPostIds.value.splice(index, 1);
    } else {
      savedPostIds.value.push(postId);
    }
  } catch (e) {
    console.error(e);
  }
};

// إدارة الردود والتعليقات بالاشتراك الحي
const toggleComments = async (postId: string) => {
  if (openCommentsPostId.value === postId) {
    openCommentsPostId.value = null;
    if (activeCommentsUnsubscribes[postId]) {
      activeCommentsUnsubscribes[postId]();
      delete activeCommentsUnsubscribes[postId];
    }
    return;
  }
  openCommentsPostId.value = postId;
  
  const { $firebase } = useNuxtApp();
  try {
    if (activeCommentsUnsubscribes[postId]) {
      activeCommentsUnsubscribes[postId]();
    }
    activeCommentsUnsubscribes[postId] = $firebase.subscribeComments(postId, (freshComments) => {
      activePostComments.value[postId] = freshComments;
    });
  } catch (e) {
    console.error(e);
  }
};

// إضافة تعليق
const publishComment = async (postId: string) => {
  if (!(await ensureAuth())) return;
  const commentText = newCommentContent.value[postId];
  if (!commentText || !commentText.trim()) return;

  const { $firebase } = useNuxtApp();
  const post = posts.value.find(p => p.id === postId);
  if (!post) return;

  // توليد معرف مؤقت
  const tempCommentId = 'temp_comment_' + Date.now();
  const optimisticComment = {
    id: tempCommentId,
    postId,
    authorName: currentUser.value.displayName || 'مستخدم جوجل',
    authorAvatar: currentUser.value.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.value.displayName}`,
    content: commentText,
    createdAt: new Date().toISOString(),
    isPending: true // وسم للإشارة إلى أنه قيد الإرسال
  };

  // إضافة التعليق محلياً وتصفير صندوق النص فورا
  if (!activePostComments.value[postId]) {
    activePostComments.value[postId] = [];
  }
  activePostComments.value[postId].push(optimisticComment);
  const originalCommentsCount = post.commentsCount || 0;
  post.commentsCount = originalCommentsCount + 1;
  newCommentContent.value[postId] = '';

  try {
    const realComment = await $firebase.addComment(
      postId, 
      commentText, 
      currentUser.value.displayName || 'مستخدم جوجل', 
      currentUser.value.photoURL
    );
    // استبدال التعليق المؤقت بالتعليق الحقيقي المستلم من السيرفر
    if (realComment && activePostComments.value[postId]) {
      const idx = activePostComments.value[postId].findIndex(c => c.id === tempCommentId);
      if (idx > -1) {
        activePostComments.value[postId][idx] = realComment;
      }
    }
  } catch (e) {
    console.error("فشل نشر التعليق، تراجع عن التحديث التفاؤلي:", e);
    // التراجع في حالة الفشل
    if (activePostComments.value[postId]) {
      activePostComments.value[postId] = activePostComments.value[postId].filter(c => c.id !== tempCommentId);
    }
    post.commentsCount = originalCommentsCount;
    // إعادة النص المكتوب لصندوق الإدخال للمحاولة مجدداً
    newCommentContent.value[postId] = commentText;
  }
};

// نشر خاطرة من الصفحة الرئيسية
const publishPost = async () => {
  if (!newPostContent.value.trim()) return;
  const { $firebase } = useNuxtApp();
  
  let verseRef = null;
  if (isAttachingVerse.value) {
    if (isCustomVerse.value) {
      verseRef = {
        surahId: 0,
        surahName: customSurahName.value || 'مخصصة',
        verseNumber: Number(customVerseNumber.value) || 1,
        text: customVerseText.value,
        tafsir: customVerseTafsir.value || 'تفسير مضاف من الناشر'
      };
    } else if (apiVerseText.value) {
      verseRef = {
        surahId: attachedSurahId.value,
        surahName: currentAttachedSurah.value ? currentAttachedSurah.value.name : 'مخصصة',
        verseNumber: attachedVerseNumber.value,
        text: apiVerseText.value,
        tafsir: apiVerseTafsir.value
      };
    }
  }

  const content = newPostContent.value;
  const author = authorName.value;
  const tempPostId = 'temp_post_' + Date.now();

  const optimisticPost = {
    id: tempPostId,
    userId: userId.value,
    authorName: author,
    authorAvatar: currentUser.value?.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${author}`,
    content: content,
    verseRef,
    likesCount: 0,
    likedBy: [],
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    isPending: true
  };

  // إضافة تفاؤلية للمنشور
  posts.value.unshift(optimisticPost);
  newPostContent.value = '';
  isAttachingVerse.value = false;
  isCustomVerse.value = false;
  customSurahName.value = '';
  customVerseNumber.value = '';
  customVerseText.value = '';
  customVerseTafsir.value = '';
  showSuccessAlert.value = true;
  
  const timer = setTimeout(() => {
    showSuccessAlert.value = false;
  }, 4000);

  try {
    const newPostObj = await $firebase.createPost(
      content,
      verseRef,
      author,
      userId.value,
      currentUser.value?.photoURL
    );
    if (newPostObj) {
      const idx = posts.value.findIndex(p => p.id === tempPostId);
      if (idx > -1) {
        posts.value[idx] = newPostObj;
      }
    }
  } catch (e) {
    console.error("فشل النشر من الرئيسية:", e);
    posts.value = posts.value.filter(p => p.id !== tempPostId);
    newPostContent.value = content;
    showSuccessAlert.value = false;
    clearTimeout(timer);
  }
};

// تبديل الوضع الداكن
const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('menhaj_theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('menhaj_theme', 'light');
  }
};

// حالات مشاركة المنشور
const sharingPost = ref<any | null>(null);
const isShareModalOpen = ref(false);
const shareImageUri = ref<string>('');
const shareImageFile = ref<File | null>(null);
const isGeneratingShareImage = ref(false);

const openShareModal = async (post: any) => {
  sharingPost.value = post;
  isShareModalOpen.value = true;
  isGeneratingShareImage.value = true;
  shareImageUri.value = '';
  shareImageFile.value = null;

  try {
    const { uri, file } = await generateShareImage(post);
    shareImageUri.value = uri;
    shareImageFile.value = file;
  } catch (e) {
    console.error("خطأ في توليد صورة المشاركة:", e);
  } finally {
    isGeneratingShareImage.value = false;
  }
};

const handleShare = async (post: any) => {
  if (typeof window !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'خاطرة قرآنية بقلم ' + post.authorName,
        text: post.content + (post.verseRef ? `\nسورة ${post.verseRef.surahName} - آية ${post.verseRef.verseNumber}\n« ${post.verseRef.text} »` : ''),
        url: window.location.origin + `/#post-${post.id}`
      });
      return;
    } catch (e) {
      console.log('Native share failed or dismissed, opening fallback modal:', e);
    }
  }
  openShareModal(post);
};

const closeShareModal = () => {
  isShareModalOpen.value = false;
  sharingPost.value = null;
  shareImageUri.value = '';
  shareImageFile.value = null;
};

// توليد صورة البطاقة بشكل مطابق للموقع تماماً
const generateShareImage = async (post: any): Promise<{ uri: string, file: File }> => {
  if (typeof window !== 'undefined' && document && document.fonts) {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("لا يمكن تهيئة Canvas");

  const width = 640;
  
  // تحديد الألوان بناءً على المظهر الحالي للموقع ليكون مطابقاً تماماً
  const isDark = isDarkMode.value;
  const theme = {
    bgPrimary: isDark ? '#090d16' : '#f8fafc',
    bgSecondary: isDark ? '#101726' : '#ffffff',
    borderFeed: isDark ? '#1e293b' : '#e2e8f0',
    textMain: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#475569',
    colorPrimary: isDark ? '#10b981' : '#064e3b',
    colorSecondary: isDark ? '#f59e0b' : '#b45309',
    textQuran: isDark ? '#34d399' : '#064e3b',
    verseBg: isDark ? '#090d16' : '#f8fafc',
  };

  // وظيفة التفاف النص المتقدمة
  const getWrappedLines = (c: any, text: string, maxWidth: number) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (let n = 0; n < words.length; n++) {
      let testLine = currentLine + words[n] + ' ';
      let metrics = c.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(currentLine.trim());
        currentLine = words[n] + ' ';
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trim());
    return lines;
  };

  // حساب الارتفاع ديناميكياً
  const headerHeight = 90;
  
  ctx.font = '20px Cairo, sans-serif';
  const contentWidth = width - 80;
  const contentLines = getWrappedLines(ctx, post.content, contentWidth);
  const contentHeight = contentLines.length * 32;

  let verseBlockHeight = 0;
  let verseLines: string[] = [];
  let tafsirLines: string[] = [];
  const verseCardWidth = width - 80;
  const verseContentWidth = verseCardWidth - 40;

  if (post.verseRef) {
    ctx.font = 'bold 22px Amiri, serif';
    verseLines = getWrappedLines(ctx, `« ${post.verseRef.text} »`, verseContentWidth);
    
    ctx.font = 'italic 15px Cairo, sans-serif';
    tafsirLines = getWrappedLines(ctx, `التفسير الميسر: ${post.verseRef.tafsir}`, verseContentWidth);

    verseBlockHeight = 40 + 30 + (verseLines.length * 38) + 15 + (tafsirLines.length * 24) + 15;
  }

  const footerHeight = 70;
  const totalHeight = 24 + headerHeight + 16 + contentHeight + (post.verseRef ? 20 + verseBlockHeight : 0) + 24 + footerHeight + 24;

  canvas.width = width;
  canvas.height = totalHeight;

  // الخلفية الأساسية
  ctx.fillStyle = theme.bgPrimary;
  ctx.fillRect(0, 0, width, totalHeight);

  // رسم الكرت الرئيسي (Tweet Card)
  ctx.fillStyle = theme.bgSecondary;
  ctx.strokeStyle = theme.borderFeed;
  ctx.lineWidth = 1;
  
  const drawRoundedRect = (c: any, x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  drawRoundedRect(ctx, 16, 16, width - 32, totalHeight - 32, 16);
  ctx.fill();
  ctx.stroke();

  // رسم الأفاتار الدائري (رسم الحرف الأول للكاتب لتلافي CORS التابع للصور الخارجية)
  const avatarX = width - 40 - 48;
  const avatarY = 40;
  
  const avGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + 48, avatarY + 48);
  avGrad.addColorStop(0, theme.colorPrimary);
  avGrad.addColorStop(1, theme.colorSecondary);
  ctx.fillStyle = avGrad;
  ctx.beginPath();
  ctx.arc(avatarX + 24, avatarY + 24, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const firstLetter = (post.authorName || 'ط').charAt(0);
  ctx.fillText(firstLetter, avatarX + 24, avatarY + 26);

  // كاتب التدبر والتوقيت
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.textMain;
  ctx.font = 'bold 18px Cairo, sans-serif';
  ctx.fillText(post.authorName || 'طالب علم', width - 104, 60);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '13px Cairo, sans-serif';
  const formattedTime = new Date(post.createdAt).toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  ctx.fillText(formattedTime, width - 104, 82);

  // الخاطرة الأساسية
  ctx.fillStyle = theme.textMain;
  ctx.font = '20px Cairo, sans-serif';
  ctx.textAlign = 'right';
  
  let currentY = 130;
  for (let i = 0; i < contentLines.length; i++) {
    ctx.fillText(contentLines[i], width - 40, currentY);
    currentY += 32;
  }

  // رسم كرت الآية والتفسير (القرآن المرفق)
  if (post.verseRef) {
    currentY += 12;
    const blockX = 40;
    const blockY = currentY;
    
    ctx.fillStyle = theme.verseBg;
    drawRoundedRect(ctx, blockX, blockY, verseCardWidth, verseBlockHeight, 12);
    ctx.fill();
    ctx.strokeStyle = theme.borderFeed;
    ctx.stroke();

    // رسم الإطار الذهبي الأيمن للآية
    ctx.fillStyle = theme.colorSecondary;
    ctx.beginPath();
    ctx.moveTo(blockX + verseCardWidth, blockY + 12);
    ctx.lineTo(blockX + verseCardWidth, blockY + verseBlockHeight - 12);
    ctx.lineWidth = 6;
    ctx.strokeStyle = theme.colorSecondary;
    ctx.stroke();

    ctx.fillStyle = theme.colorSecondary;
    ctx.font = 'bold 15px Cairo, sans-serif';
    ctx.fillText(`سورة ${post.verseRef.surahName} - الآية ${post.verseRef.verseNumber}`, width - 60, blockY + 30);

    ctx.fillStyle = theme.textQuran;
    ctx.font = 'bold 22px Amiri, serif';
    ctx.textAlign = 'center';
    let verseY = blockY + 68;
    for (let i = 0; i < verseLines.length; i++) {
      ctx.fillText(verseLines[i], width / 2, verseY);
      verseY += 38;
    }

    ctx.fillStyle = theme.textMuted;
    ctx.font = 'italic 15px Cairo, sans-serif';
    let tafsirY = verseY + 10;
    for (let i = 0; i < tafsirLines.length; i++) {
      ctx.fillText(tafsirLines[i], width / 2, tafsirY);
      tafsirY += 24;
    }

    currentY += verseBlockHeight + 16;
  }

  // الفوتر
  ctx.strokeStyle = theme.borderFeed;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, currentY + 10);
  ctx.lineTo(width - 40, currentY + 10);
  ctx.stroke();

  currentY += 42;
  
  ctx.fillStyle = theme.colorPrimary;
  ctx.font = 'bold 16px Cairo, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('المنهاج الوهاج | خواطر وتفاسير', width - 40, currentY);

  ctx.fillStyle = theme.textMuted;
  ctx.font = '14px Cairo, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('menhaj-ohaaj.web.app', 40, currentY);

  const uri = canvas.toDataURL('image/png');
  
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
  const file = new File([blob], `menhaj_reflection_${post.id}.png`, { type: 'image/png' });

  return { uri, file };
};

// النشر عبر منصات التواصل الاجتماعي
const shareViaApp = async (platform: string) => {
  if (!sharingPost.value) return;
  
  const textToShare = `المنهاج الوهاج - خاطرة قرآنية قيّمة بقلم ${sharingPost.value.authorName}:\n${sharingPost.value.content}\nتصفحها كاملة عبر الرابط:\nhttps://menhaj-ohaaj.web.app/#post-${sharingPost.value.id}`;
  const encodedText = encodeURIComponent(textToShare);
  const encodedUrl = encodeURIComponent(`https://menhaj-ohaaj.web.app/#post-${sharingPost.value.id}`);

  if (platform === 'whatsapp') {
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
  } else if (platform === 'telegram') {
    window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank');
  } else if (platform === 'twitter') {
    window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
  } else if (platform === 'facebook') {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');
  } else if (platform === 'system') {
    if (navigator.share && shareImageFile.value) {
      try {
        await navigator.share({
          files: [shareImageFile.value],
          title: 'خاطرة قرآنية من المنهاج الوهاج',
          text: textToShare
        });
      } catch (e) {
        console.error("فشلت المشاركة عبر النظام:", e);
      }
    } else {
      downloadGeneratedImage();
    }
  }
};

// تحميل الصورة
const downloadGeneratedImage = () => {
  if (!shareImageUri.value || !sharingPost.value) return;
  const link = document.createElement('a');
  link.download = `menhaj_reflection_${sharingPost.value.id}.png`;
  link.href = shareImageUri.value;
  link.click();
};

// ميزة الفائدة العشوائية (Tadabbur Roulette)
const isRouletteModalOpen = ref(false);
const roulettePost = ref<any | null>(null);

const triggerRoulette = () => {
  if (posts.value.length === 0) return;
  const randomIndex = Math.floor(Math.random() * posts.value.length);
  roulettePost.value = posts.value[randomIndex];
  isRouletteModalOpen.value = true;
};

// نسخ الرابط
const copyPostLink = async () => {
  if (!sharingPost.value) return;
  const link = `https://menhaj-ohaaj.web.app/#post-${sharingPost.value.id}`;
  try {
    await navigator.clipboard.writeText(link);
    alert('تم نسخ الرابط بنجاح!');
  } catch (e) {
    console.error(e);
  }
};
</script>

<template>
  <div class="app-layout">
    <!-- الخلفية المظلمة للقائمة الجانبية في الجوال -->
    <div v-if="isMobileMenuOpen" class="mobile-overlay" @click="isMobileMenuOpen = false"></div>

    <!-- 1. شريط التنقل الجانبي الأيمن -->
    <aside class="sidebar-nav" :class="{ 'mobile-open': isMobileMenuOpen }">
      <div>
        <!-- رأس القائمة للجوال لإمكانية الإغلاق -->
        <div class="mobile-menu-header" style="justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <span style="font-weight: 800; color: var(--color-primary);">المنهاج الوهاج</span>
          <button @click="isMobileMenuOpen = false" style="background: transparent; border: none; font-size: 1.25rem; color: var(--text-muted); cursor: pointer;" aria-label="إغلاق القائمة">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="logo-section">
          <i class="fa-solid fa-kaaba logo-icon"></i>
          <div>
            <h1 class="logo-title">المنهاج الوهاج</h1>
            <span class="logo-desc">مدونة الخواطر القرآنية والتفاسير</span>
          </div>
        </div>

        <nav class="nav-links" aria-label="شريط التنقل الجانبي">
          <button 
            @click="activeTab = 'all'; isMobileMenuOpen = false;" 
            :class="['nav-item', { active: activeTab === 'all' }]"
          >
            <i class="fa-solid fa-house"></i>
            <span>الخلاصة الرئيسية</span>
          </button>
          
          <button 
            @click="activeTab = 'saved'; isMobileMenuOpen = false;" 
            :class="['nav-item', { active: activeTab === 'saved' }]"
          >
            <i class="fa-solid fa-bookmark"></i>
            <span>الخواطر المحفوظة</span>
          </button>



          <button v-if="!isNotificationPermissionGranted" @click="requestNotificationPermission" class="nav-item" style="color: var(--color-secondary);">
            <i class="fa-solid fa-bell"></i>
            <span>تفعيل التنبيهات</span>
          </button>

          <button @click="toggleTheme" class="nav-item">
            <i :class="isDarkMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i>
            <span>{{ isDarkMode ? 'الوضع المضيء' : 'الوضع الداكن' }}</span>
          </button>
        </nav>
      </div>

      <!-- ويدجت تسجيل الدخول بحساب جوجل للمتفاعل -->
      <div style="border-top: 1px solid var(--border-color); padding-top: 1.25rem; margin-top: auto;">
        <div v-if="currentUser" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; background: var(--bg-secondary); padding: 0.5rem; border-radius: 12px; border: 1px solid var(--border-feed);">
            <img :src="currentUser.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'" alt="Avatar" style="width: 36px; height: 36px; border-radius: 50%;" />
            <div style="display: flex; flex-direction: column; overflow: hidden;">
              <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ currentUser.displayName }}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ currentUser.email }}</span>
            </div>
          </div>
          <button @click="handleGoogleLogout" style="width: 100%; padding: 0.6rem; border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.2); background: transparent; color: #ef4444; font-weight: 700; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.05)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> تسجيل الخروج
          </button>
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 0.75rem; text-align: center;">
          <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">سجل الدخول بحساب جوجل للتعليق والإعجاب ومزامنة تفاعلك.</p>
          <button @click="handleGoogleLogin" style="width: 100%; padding: 0.75rem; border-radius: 12px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-weight: 700; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: background 0.2s, transform 0.1s;" onmouseover="this.style.background='var(--border-color)';" onmouseout="this.style.background='var(--bg-secondary)';" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
            <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            تسجيل الدخول بجوجل
          </button>
        </div>
      </div>
    </aside>

    <!-- 2. الخلاصة الرئيسية المتوسطة -->
    <main class="main-feed">
      <div class="feed-header" style="display: flex; align-items: center; gap: 1rem; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <button @click="isMobileMenuOpen = true" class="mobile-menu-toggle" aria-label="فتح القائمة" style="background: transparent; border: none; font-size: 1.25rem; color: var(--text-main); cursor: pointer;">
            <i class="fa-solid fa-bars"></i>
          </button>
          <h2 v-if="activeTab === 'all'" style="margin: 0; font-size: 1.25rem; font-weight: 800;">الرئيسية</h2>
          <h2 v-else-if="activeTab === 'saved'" style="margin: 0; font-size: 1.25rem; font-weight: 800;">الخواطر المحفوظة</h2>
        </div>
        <!-- زر التنبيهات العشوائية للجوال -->
        <button @click="triggerRoulette" class="mobile-roulette-btn" style="background: transparent; border: none; font-size: 1.15rem; color: var(--color-primary); cursor: pointer; display: none; margin-left: 0.5rem;" aria-label="خاطرة عشوائية">
          <i class="fa-solid fa-dice"></i>
        </button>

        <!-- زر سريع لتبديل المظهر في الجوال -->
        <button @click="toggleTheme" class="mobile-theme-btn" style="background: transparent; border: none; font-size: 1.1rem; color: var(--text-main); cursor: pointer;" aria-label="تبديل المظهر">
          <i :class="isDarkMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i>
        </button>
      </div>

      <!-- تنبيه النجاح المنسق بالنشر -->
      <div v-if="showSuccessAlert" style="background: #e6f4ea; border: 1px solid #137333; color: #137333; padding: 0.75rem 1rem; border-radius: 12px; margin: 1rem; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; animation: fadeIn 0.3s;">
        <i class="fa-solid fa-circle-check" style="font-size: 1.1rem;"></i>
        <span>تم نشر تدبرك الجديد بنجاح ويظهر الآن للجميع!</span>
      </div>

      <!-- بطاقة آية اليوم (تظهر في الجوال فقط) -->
      <div v-if="activeTab === 'all'" class="widget-card mobile-only-ayah" style="border-right: 4px solid var(--color-secondary); margin: 1rem;">
        <h3 class="widget-title" style="font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-weight: 800;">
          <i class="fa-solid fa-star"></i> آية اليوم المتجددة
        </h3>
        <p style="font-family: var(--font-quran); font-size: 1.25rem; color: var(--text-quran); line-height: 1.6; text-align: center; margin-bottom: 0.75rem;">
          « {{ ayahOfTheDay.text }} »
        </p>
        <p style="font-size: 0.8rem; color: var(--color-secondary); font-weight: 700; margin-bottom: 0.5rem; text-align: left;">
          سورة {{ ayahOfTheDay.surahName }} - آية {{ ayahOfTheDay.verseNumber }}
        </p>
        <p style="font-size: 0.8rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 0.5rem; line-height: 1.5;">
          <strong>التفسير: </strong> {{ ayahOfTheDay.tafsir }}
        </p>
      </div>



      <!-- خلاصة التغريدات والمنشورات -->
      <div v-if="isLoading && posts.length === 0">
        <div v-for="i in 3" :key="i" class="skeleton-card">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-body">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line text-long"></div>
            <div class="skeleton-line text-short"></div>
          </div>
        </div>
      </div>

      <div v-else-if="filteredPosts.length > 0">
        <div v-for="post in filteredPosts" :key="post.id" class="tweet-card">
          <img class="user-avatar" :src="post.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorName}`" alt="Avatar" />
          <div class="tweet-body">
            <div class="tweet-header">
              <div class="tweet-author-info">
                <span class="tweet-author-name">{{ post.authorName }}</span>
                <span class="tweet-timestamp">• {{ new Date(post.createdAt).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'}) }}</span>
              </div>
            </div>
            
            <p class="tweet-text">{{ post.content }}</p>

            <!-- عرض الآية والتفسير المرفقين بالمنشور -->
            <div class="tweet-verse-card" v-if="post.verseRef">
              <span class="tweet-verse-ref">
                <i class="fa-solid fa-book-quran"></i> سورة {{ post.verseRef.surahName }} - الآية {{ post.verseRef.verseNumber }}
              </span>
              <p class="tweet-verse-text">« {{ post.verseRef.text }} »</p>
              <p class="tweet-verse-tafsir"><strong>التفسير الميسر:</strong> {{ post.verseRef.tafsir }}</p>
            </div>

            <!-- أزرار التفاعل لأسفل المنشور -->
            <div class="tweet-footer">
              <button @click="toggleComments(post.id)" class="action-btn" title="الردود والمناقشات">
                <i class="fa-regular fa-comment"></i>
                <span>{{ post.commentsCount || 0 }}</span>
              </button>
              <button @click="handleLike(post.id)" class="action-btn like-btn" :class="{ active: post.likedBy?.includes(userId) }" title="الإعجابات">
                <i :class="post.likedBy?.includes(userId) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'"></i>
                <span>{{ post.likesCount || 0 }}</span>
              </button>
              <button @click="handleSave(post.id)" class="action-btn bookmark-btn" :class="{ active: savedPostIds.includes(post.id) }" title="حفظ الخاطرة">
                <i :class="savedPostIds.includes(post.id) ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'"></i>
              </button>
              <button @click="handleShare(post)" class="action-btn share-image-btn" title="تحميل كصورة للنشر" style="color: var(--text-muted); cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color='var(--text-muted)'">
                <i class="fa-solid fa-share-nodes"></i>
              </button>
            </div>

            <!-- قسم التعليقات المنسدل للزوار -->
            <div class="replies-section" v-if="openCommentsPostId === post.id">
              <div v-if="activePostComments[post.id]?.length > 0" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
                <div v-for="comment in activePostComments[post.id]" :key="comment.id" class="reply-item" style="display: flex; gap: 0.75rem; align-items: start; padding: 0.5rem 0; border-bottom: 1px dashed var(--border-color);">
                  <img :src="comment.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${comment.authorName}`" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; background: var(--border-color); flex-shrink: 0;" />
                  <div style="flex: 1; display: flex; flex-direction: column; gap: 0.15rem;">
                    <div class="reply-meta" style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: var(--color-primary);">
                      <span>{{ comment.authorName }}</span>
                      <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">{{ new Date(comment.createdAt).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'}) }}</span>
                    </div>
                    <p class="reply-text" :style="{ opacity: comment.isPending ? 0.65 : 1 }" style="font-size: 0.9rem; color: var(--text-main); margin-top: 0.15rem; white-space: pre-wrap; line-height: 1.4;">
                      {{ comment.content }}
                      <span v-if="comment.isPending" style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <i class="fa-solid fa-spinner fa-spin"></i> جاري النشر...
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div v-else style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">لا توجد ردود بعد، كن أول المعلقين!</div>
              
              <!-- صندوق إضافة رد -->
              <div class="reply-composer">
                <input 
                  type="text" 
                  class="reply-input" 
                  v-model="newCommentContent[post.id]" 
                  @keyup.enter="publishComment(post.id)"
                  placeholder="اكتب ردك ومناقشتك..."
                />
                <button @click="publishComment(post.id)" class="reply-btn">رد</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else style="padding: 4rem 2rem; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-paper-plane" style="font-size: 3rem; margin-bottom: 1rem; color: var(--color-primary); opacity: 0.4;"></i>
        <h3>لا توجد منشورات لعرضها</h3>
        <p>بانتظار الناشر الإداري لكتابة الخواطر والفوائد القرآنية.</p>
      </div>
    </main>

    <!-- 3. العمود الأيسر: شريط الأدوات والبطاقات الجانبية -->
    <aside class="widgets-sidebar">
      <!-- شريط البحث الجانبي -->
      <div class="search-widget">
        <input 
          type="text" 
          class="search-widget-input" 
          v-model="searchQuery" 
          placeholder="ابحث في الخلاصة والآيات..."
        />
        <i class="fa-solid fa-magnifying-glass search-widget-icon"></i>
      </div>

      <!-- بطاقة آية اليوم -->
      <div class="widget-card" style="border-right: 4px solid var(--color-secondary);">
        <h3 class="widget-title"><i class="fa-solid fa-star"></i> آية اليوم المتجددة</h3>
        <p style="font-family: var(--font-quran); font-size: 1.25rem; color: var(--text-quran); line-height: 1.6; text-align: center; margin-bottom: 0.75rem;">
          « {{ ayahOfTheDay.text }} »
        </p>
        <p style="font-size: 0.8rem; color: var(--color-secondary); font-weight: 700; margin-bottom: 0.5rem; text-align: left;">
          سورة {{ ayahOfTheDay.surahName }} - آية {{ ayahOfTheDay.verseNumber }}
        </p>
        <p style="font-size: 0.8rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 0.5rem; line-height: 1.5;">
          <strong>التفسير: </strong> {{ ayahOfTheDay.tafsir }}
        </p>
      </div>
      <!-- ويدجت الفائدة العشوائية -->
      <div class="widget-card roulette-widget" style="border-right: 4px solid var(--color-primary);">
        <h3 class="widget-title"><i class="fa-solid fa-wand-magic-sparkles"></i> فائدة تدبرية عشوائية</h3>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.45;">
          هل تبحث عن إلهام وتدبر سريع؟ دع الذكاء يختار لك فائدة عشوائية من المنصة.
        </p>
        <button @click="triggerRoulette" class="publish-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.6rem; font-size: 0.85rem; border-radius: 10px;">
          <i class="fa-solid fa-dice"></i> تدبر عشوائي
        </button>
      </div>

      <!-- مصادر إضافية وموثوقة -->
      <div class="widget-card">
        <h3 class="widget-title"><i class="fa-solid fa-link"></i> مراجع موثوقة</h3>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem;">
          <li>
            <a href="https://quran.com/ar" target="_blank" rel="noopener noreferrer" style="color: var(--text-main); font-size: 0.85rem; text-decoration: none; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-book-quran" style="color: var(--color-primary);"></i> موقع القرآن الكريم
            </a>
          </li>
          <li>
            <a href="https://www.altafsir.com/" target="_blank" rel="noopener noreferrer" style="color: var(--text-main); font-size: 0.85rem; text-decoration: none; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-bookmark" style="color: var(--color-primary);"></i> موسوعة التفاسير
            </a>
          </li>
          <li>
            <a href="https://sunnah.com/arabic" target="_blank" rel="noopener noreferrer" style="color: var(--text-main); font-size: 0.85rem; text-decoration: none; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fa-solid fa-globe" style="color: var(--color-primary);"></i> الموسوعة الحديثية
            </a>
          </li>
        </ul>
      </div>
    </aside>

    <!-- مودال المشاركة الفاخر -->
    <div v-if="isShareModalOpen" class="share-modal-overlay" @click.self="closeShareModal">
      <div class="share-modal-card">
        <div class="share-modal-header">
          <h3><i class="fa-solid fa-share-nodes"></i> مشاركة الخاطرة كصورة</h3>
          <button @click="closeShareModal" class="close-modal-btn">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="share-modal-body">
          <!-- معاينة الصورة المتولدة -->
          <div class="share-image-preview-container">
            <div v-if="isGeneratingShareImage" class="preview-loading">
              <i class="fa-solid fa-spinner fa-spin"></i>
              <span>جاري توليد الصورة بمظهر الموقع...</span>
            </div>
            <img v-else :src="shareImageUri" alt="معاينة الصورة" class="share-image-preview" />
          </div>

          <!-- شبكة أزرار النشر والتطبيقات -->
          <div class="share-options-grid">
            <button @click="shareViaApp('system')" class="share-option-btn system-share" title="مشاركة كصورة (إنستغرام، واتساب...)">
              <i class="fa-solid fa-share-from-square"></i>
              <span>مشاركة كصورة (إنستغرام، واتساب...)</span>
            </button>
            <button @click="downloadGeneratedImage" class="share-option-btn download-share">
              <i class="fa-solid fa-download"></i>
              <span>حفظ الصورة في الجهاز</span>
            </button>
            <button @click="shareViaApp('whatsapp')" class="share-option-btn whatsapp-share">
              <i class="fa-brands fa-whatsapp"></i>
              <span>واتساب</span>
            </button>
            <button @click="shareViaApp('telegram')" class="share-option-btn telegram-share">
              <i class="fa-brands fa-telegram"></i>
              <span>تيليجرام</span>
            </button>
            <button @click="shareViaApp('twitter')" class="share-option-btn twitter-share">
              <i class="fa-brands fa-x-twitter"></i>
              <span>تويتر / إكس</span>
            </button>
            <button @click="shareViaApp('facebook')" class="share-option-btn facebook-share">
              <i class="fa-brands fa-facebook-f"></i>
              <span>فيسبوك</span>
            </button>
            <button @click="copyPostLink" class="share-option-btn copy-link-share">
              <i class="fa-solid fa-link"></i>
              <span>نسخ الرابط</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- الزر العائم للناشرين -->
    <button 
      v-if="isPublisher && activeTab === 'all'" 
      @click="isComposerModalOpen = true" 
      class="composer-fab"
      aria-label="كتابة تدبر جديد"
    >
      <i class="fa-solid fa-pen-nib"></i>
    </button>

    <!-- مودال كتابة الخاطرة العائم للناشرين -->
    <div v-if="isComposerModalOpen" class="composer-modal-overlay" @click.self="isComposerModalOpen = false">
      <div class="composer-modal-card">
        <div class="composer-modal-header">
          <h3><i class="fa-solid fa-pen-fancy"></i> تدوين تدبر جديد</h3>
          <button @click="isComposerModalOpen = false" class="close-modal-btn">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="composer-modal-body">
          <div style="display: flex; gap: 0.75rem; align-items: start;">
            <img :src="currentUser?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%;" />
            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.75rem;">
              <textarea 
                v-model="newPostContent" 
                placeholder="اكتب تدبراً جديداً بآيات الله أو خاطرة لتعميم الفائدة..." 
                style="width: 100%; min-height: 120px; border: none; background: transparent; color: var(--text-main); font-family: var(--font-arabic); font-size: 1.05rem; resize: none; outline: none; line-height: 1.5;"
              ></textarea>

              <!-- ربط الآية والتفسير -->
              <div v-if="isAttachingVerse" style="padding: 0.75rem; border-radius: 10px; background: var(--bg-primary); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem; text-align: right;">
                <div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.25rem;">
                  <input type="checkbox" id="modal-custom-verse-check" v-model="isCustomVerse" style="width: 14px; height: 14px; accent-color: var(--color-primary); cursor: pointer;" />
                  <label for="modal-custom-verse-check" style="font-size: 0.8rem; font-weight: 700; cursor: pointer; color: var(--text-main);">كتابة أو لصق آية مخصصة</label>
                </div>

                <div v-if="!isCustomVerse" style="display: flex; flex-direction: column; gap: 0.5rem;">
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <select v-model="attachedSurahId" @change="handleSurahChange" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem; font-weight: 700;">
                      <option v-for="surah in apiSurahs" :key="surah.number" :value="surah.number">
                        سورة {{ surah.name }}
                      </option>
                    </select>
                    <select v-model="attachedVerseNumber" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem; font-weight: 700;">
                      <option v-for="n in currentAttachedVersesCount" :key="n" :value="n">
                        آية {{ n }}
                      </option>
                    </select>
                  </div>
                  
                  <div v-if="isLoadingVerseText" style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">
                    <i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل نص الآية والتفسير...
                  </div>
                  <div v-else style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div style="font-family: var(--font-quran); font-size: 1.15rem; color: var(--color-primary); text-align: center; line-height: 1.5; padding: 0.25rem 0;">
                      « {{ apiVerseText }} »
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 0.25rem; line-height: 1.4;">
                      <strong>التفسير الميسر:</strong> {{ apiVerseTafsir }}
                    </div>
                  </div>
                </div>

                <div v-else style="display: flex; flex-direction: column; gap: 0.5rem;">
                  <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 0.5rem;">
                    <input type="text" v-model="customSurahName" placeholder="اسم السورة (مثال: البقرة)" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem;" />
                    <input type="text" v-model="customVerseNumber" placeholder="رقم الآية (مثال: 255)" style="padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem;" />
                  </div>
                  <textarea v-model="customVerseText" placeholder="اكتب أو الصق نص الآية الكريمة هنا..." style="width: 100%; min-height: 50px; padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--color-primary); font-family: var(--font-quran); font-size: 1.15rem; resize: none; outline: none; text-align: center;"></textarea>
                  <textarea v-model="customVerseTafsir" placeholder="اكتب أو الصق التفسير الميسر هنا (اختياري)..." style="width: 100%; min-height: 40px; padding: 0.4rem; border-radius: 6px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-muted); font-family: var(--font-arabic); font-size: 0.8rem; resize: none; outline: none;"></textarea>
                </div>
              </div>
            </div>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 1rem;">
            <button 
              @click="isAttachingVerse = !isAttachingVerse" 
              :style="{ color: isAttachingVerse ? 'var(--color-secondary)' : 'var(--text-muted)' }"
              style="background: transparent; border: none; font-size: 0.9rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-family: var(--font-arabic);"
            >
              <i class="fa-solid fa-book-quran"></i>
              {{ isAttachingVerse ? 'إلغاء ربط الآية' : 'ربط آية قرآنية' }}
            </button>
            
            <button 
              @click="publishPostFromModal" 
              :disabled="!newPostContent.trim()"
              style="padding: 0.5rem 1.5rem; border: none; border-radius: 20px; color: #fff; font-weight: 700; font-size: 0.85rem; font-family: var(--font-arabic); transition: opacity 0.2s;"
              :style="{ 
                background: !newPostContent.trim() ? 'var(--border-color)' : 'var(--color-primary)', 
                cursor: !newPostContent.trim() ? 'not-allowed' : 'pointer' 
              }"
            >
              نشر الخاطرة
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- نظام إشعارات التوست الفاخر -->
    <Transition name="toast-fade">
      <div v-if="activeToast" class="toast-notification-card" @click="activeToast = null">
        <img :src="activeToast.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activeToast.authorName}`" alt="avatar" class="toast-avatar" />
        <div class="toast-content">
          <div class="toast-header-text">خاطرة قرآنية جديدة بقلم {{ activeToast.authorName }}</div>
          <p class="toast-body-text">{{ activeToast.content.substring(0, 70) }}...</p>
        </div>
      </div>
    </Transition>
    <!-- مودال الفائدة العشوائية -->
    <div v-if="isRouletteModalOpen" class="composer-modal-overlay" @click.self="isRouletteModalOpen = false">
      <div class="composer-modal-card" style="max-width: 500px; border-right: 4px solid var(--color-primary);">
        <div class="composer-modal-header" style="border-bottom: 1px dashed var(--border-color);">
          <h3><i class="fa-solid fa-wand-magic-sparkles"></i> خاطرة قرآنية عشوائية</h3>
          <button @click="isRouletteModalOpen = false" class="close-modal-btn">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="composer-modal-body" v-if="roulettePost" style="gap: 1rem; text-align: right; padding: 1.5rem 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <img :src="roulettePost.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${roulettePost.authorName}`" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;" />
            <span style="font-weight: 700; color: var(--color-primary); font-size: 0.95rem;">{{ roulettePost.authorName }}</span>
          </div>
          
          <p style="font-size: 1rem; line-height: 1.6; color: var(--text-main); margin: 0; white-space: pre-wrap;">
            {{ roulettePost.content }}
          </p>

          <div class="tweet-verse-card" v-if="roulettePost.verseRef" style="margin: 0; background: var(--bg-primary);">
            <span class="tweet-verse-ref">
              <i class="fa-solid fa-book-quran"></i> سورة {{ roulettePost.verseRef.surahName }} - الآية {{ roulettePost.verseRef.verseNumber }}
            </span>
            <p class="tweet-verse-text" style="font-size: 1.2rem; line-height: 1.6;">« {{ roulettePost.verseRef.text }} »</p>
            <p class="tweet-verse-tafsir" style="margin: 0; font-size: 0.82rem; line-height: 1.5;"><strong>التفسير الميسر:</strong> {{ roulettePost.verseRef.tafsir }}</p>
          </div>

          <button @click="triggerRoulette" class="publish-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.5rem; padding: 0.75rem; border-radius: 12px;">
            <i class="fa-solid fa-dice"></i> خاطرة عشوائية أخرى
          </button>
        </div>
      </div>
    </div>

    <!-- شريط التنقل السفلي الثابت للجوال -->
    <nav class="mobile-bottom-nav">
      <button @click="activeTab = 'all'" :class="{ active: activeTab === 'all' }" class="mobile-nav-btn">
        <i class="fa-solid fa-house"></i>
        <span>الرئيسية</span>
      </button>
      <button @click="activeTab = 'saved'" :class="{ active: activeTab === 'saved' }" class="mobile-nav-btn">
        <i class="fa-solid fa-bookmark"></i>
        <span>المحفوظة</span>
      </button>
      <a href="https://quran.com/ar" target="_blank" rel="noopener noreferrer" class="mobile-nav-btn">
        <i class="fa-solid fa-book-quran"></i>
        <span>القرآن</span>
      </a>
    </nav>
  </div>
</template>

<style>
/* تنسيقات مودال المشاركة الفاخر */
.share-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  animation: fadeInModal 0.25s ease-out;
}

.share-modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-feed);
  width: 90%;
  max-width: 500px;
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: scaleUpModal 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.share-modal-header {
  padding: 1.25rem;
  border-bottom: 1px solid var(--border-feed);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.share-modal-header h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.close-modal-btn {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: var(--text-muted);
  cursor: pointer;
}

.share-modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: 80vh;
  overflow-y: auto;
}

.share-image-preview-container {
  width: 100%;
  aspect-ratio: 1.2;
  background: var(--bg-primary);
  border-radius: 12px;
  border: 1px dashed var(--border-feed);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.preview-loading i {
  font-size: 2rem;
  color: var(--color-primary);
}

.share-image-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.share-options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.share-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border-feed);
  background: var(--bg-secondary);
  color: var(--text-main);
  font-family: var(--font-arabic);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.share-option-btn:hover {
  background: var(--border-color);
  transform: translateY(-1px);
}

.share-option-btn.system-share {
  grid-column: span 2;
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.share-option-btn.system-share:hover {
  background: var(--color-primary-light);
}

.share-option-btn.download-share {
  grid-column: span 2;
  background: var(--color-gold-glow);
  color: var(--color-secondary);
  border-color: var(--color-secondary);
}

.share-option-btn.download-share:hover {
  background: rgba(217, 119, 6, 0.2);
}

.share-option-btn.whatsapp-share i { color: #25d366; }
.share-option-btn.telegram-share i { color: #0088cc; }
.share-option-btn.twitter-share i { color: #1da1f2; }
.share-option-btn.facebook-share i { color: #1877f2; }

@keyframes fadeInModal {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUpModal {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* أنماط توست الإشعارات الحية */
.toast-notification-card {
  position: fixed;
  bottom: 24px;
  left: 24px;
  background: var(--bg-secondary);
  border: 1.5px solid var(--border-feed);
  border-right: 4px solid var(--color-secondary);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 3000;
  max-width: 380px;
  cursor: pointer;
  direction: rtl;
}

.toast-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.toast-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: right;
}

.toast-header-text {
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--color-primary);
}

.toast-body-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* حركة الانتقال للتوست */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

@media (max-width: 600px) {
  .toast-notification-card {
    left: 16px;
    right: 16px;
    bottom: 16px;
    max-width: none;
  }
}
</style>
