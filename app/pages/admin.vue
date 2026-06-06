<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { quranData } from '../utils/quranData';
import { fetchSurahs, fetchVerse } from '../utils/quranApi';

// حالة تسجيل دخول المشرف
const isAuthenticated = ref(false);
const authError = ref('');
const currentUser = ref<any>(null);

// البيانات والتحكم
const posts = ref<any[]>([]);
const visitorStats = ref({ total: 0, daily: 0 });
const isLoading = ref(true); // مضاف للتصميم المؤقت للمسؤول
const usersList = ref<any[]>([]);
let unsubscribePosts: (() => void) | null = null;
let unsubscribeStats: (() => void) | null = null;
let unsubscribeUsers: (() => void) | null = null;

// صندوق كتابة الخاطرة الجديدة
const newPostContent = ref('');
const authorName = ref('الناشر الإداري');
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

// السورة المحددة للإرفاق
const currentAttachedSurah = computed(() => {
  return apiSurahs.value.find(s => s.number === attachedSurahId.value) || apiSurahs.value[0];
});

// عدد الآيات المتوفرة للإرفاق
const currentAttachedVersesCount = computed(() => {
  return currentAttachedSurah.value ? currentAttachedSurah.value.numberOfAyahs : 7;
});

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

// إحصائيات حقيقية مبنية على مجموعات Firestore
const totalPostsCount = computed(() => posts.value.length);

const totalLikesCount = computed(() => {
  return posts.value.reduce((acc, p) => acc + (p.likesCount || 0), 0);
});

const totalCommentsCount = computed(() => {
  return posts.value.reduce((acc, p) => acc + (p.commentsCount || 0), 0);
});

// تعيين الآية الأولى تلقائياً عند تغيير السورة
const handleSurahChange = () => {
  attachedVerseNumber.value = 1;
};

const togglePublisher = async (userId: string, isPublisher: boolean) => {
  const { $firebase } = useNuxtApp();
  try {
    await $firebase.setUserPublisherStatus(userId, isPublisher);
  } catch (e) {
    console.error(e);
  }
};

onMounted(async () => {
  // جلب السور من الـ API
  try {
    apiSurahs.value = await fetchSurahs();
  } catch (e) {
    console.error(e);
  }

  // استرجاع الكاش لعرض الخلاصة فوراً وتفادي الانتظار
  if (typeof window !== 'undefined') {
    const cachedPosts = localStorage.getItem('menhaj_cached_posts');
    if (cachedPosts) {
      posts.value = JSON.parse(cachedPosts);
      isLoading.value = false;
    }
  }

  const { $firebase } = useNuxtApp();

  // التحقق والمتابعة الحية لحالة المصادقة بجوجل للمشرف والناشرين المصرح لهم
  $firebase.onAuthChange(async (user) => {
    currentUser.value = user;
    if (user) {
      await $firebase.syncUserProfile(user);
      const isPub = await $firebase.checkUserPublisherStatus(user.uid);
      const isSuper = user.email === 'dirgam55555@gmail.com';
      if ((isPub || isSuper) && localStorage.getItem('menhaj_admin_auth') === 'true') {
        isAuthenticated.value = true;
      } else {
        isAuthenticated.value = false;
      }
    } else {
      isAuthenticated.value = false;
    }
  });

  // الاشتراك الحي للإحصائيات الحقيقية دون التسبب بزيادة العداد
  unsubscribeStats = $firebase.subscribeStats((freshStats) => {
    if (freshStats) {
      visitorStats.value = freshStats;
    }
  });

  // الاشتراك الحي للمنشورات لمتابعة التحديثات والإعجابات والتعليقات حياً
  unsubscribePosts = $firebase.subscribePosts((freshPosts) => {
    posts.value = freshPosts;
    isLoading.value = false;
    if (typeof window !== 'undefined') {
      localStorage.setItem('menhaj_cached_posts', JSON.stringify(freshPosts));
    }
  });

  // الاشتراك الحي بقائمة المستخدمين لإدارة الصلاحيات
  unsubscribeUsers = $firebase.subscribeUsers((freshUsers) => {
    usersList.value = freshUsers;
  });
});

onUnmounted(() => {
  if (unsubscribePosts) unsubscribePosts();
  if (unsubscribeStats) unsubscribeStats();
  if (unsubscribeUsers) unsubscribeUsers();
  Object.values(activeCommentsUnsubscribes).forEach(unsub => unsub());
});

// تسجيل الدخول بلوحة الآدمن عبر جوجل
const handleLoginWithGoogle = async () => {
  const { $firebase } = useNuxtApp();
  try {
    const user = await $firebase.loginWithGoogle();
    currentUser.value = user;
    if (user) {
      await $firebase.syncUserProfile(user);
      const isPub = await $firebase.checkUserPublisherStatus(user.uid);
      const isSuper = user.email === 'dirgam55555@gmail.com';
      if (isPub || isSuper) {
        isAuthenticated.value = true;
        authError.value = '';
        if (typeof window !== 'undefined') {
          localStorage.setItem('menhaj_admin_auth', 'true');
          localStorage.setItem('menhaj_admin_email', user.email || '');
        }
      } else {
        authError.value = 'عذراً، هذا البريد غير مصرح له كمسؤول أو كناشر للخواطر.';
        await $firebase.logout();
      }
    }
  } catch (e) {
    console.error("Admin Login Failed:", e);
    authError.value = 'فشل تسجيل الدخول باستخدام جوجل، يرجى المحاولة مجدداً.';
  }
};

// تسجيل الخروج من لوحة الآدمن
const handleLogout = async () => {
  const { $firebase } = useNuxtApp();
  try {
    await $firebase.logout();
    isAuthenticated.value = false;
    currentUser.value = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('menhaj_admin_auth');
      localStorage.removeItem('menhaj_admin_email');
    }
  } catch (e) {
    console.error("Logout Error:", e);
  }
};

// نشر خاطرة جديدة
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
    } else {
      verseRef = {
        surahId: attachedSurahId.value,
        surahName: currentAttachedSurah.value ? currentAttachedSurah.value.name : '',
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
    userId: 'admin',
    authorName: author,
    authorAvatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${author}`,
    content: content,
    verseRef,
    likesCount: 0,
    likedBy: [],
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    isPending: true
  };

  // إضافة تفاؤلية للمنشور وتصفير الإدخالات فورا
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
      'admin',
      currentUser.value?.photoURL
    );
    if (newPostObj) {
      const idx = posts.value.findIndex(p => p.id === tempPostId);
      if (idx > -1) {
        posts.value[idx] = newPostObj;
      }
    }
  } catch (e) {
    console.error("فشل نشر الخاطرة القرآنية، تراجع عن التحديث التفاؤلي:", e);
    posts.value = posts.value.filter(p => p.id !== tempPostId);
    newPostContent.value = content; // إعادة النص للناشر للمحاولة مجدداً
    showSuccessAlert.value = false;
    clearTimeout(timer);
  }
};

// حذف منشور
const deletePost = async (postId: string) => {
  if (typeof window !== 'undefined' && !confirm('هل أنت متأكد من رغبتك في حذف هذا المنشور نهائياً من قاعدة البيانات؟')) {
    return;
  }
  
  const { $firebase } = useNuxtApp();
  const originalPosts = [...posts.value];
  
  // تحديث محلي فوري
  posts.value = posts.value.filter(p => p.id !== postId);

  // تحديث الكاش المحلي فوراً
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('menhaj_cached_posts');
    if (cached) {
      const parsed = JSON.parse(cached).filter((p: any) => p.id !== postId);
      localStorage.setItem('menhaj_cached_posts', JSON.stringify(parsed));
    }
  }

  try {
    await $firebase.deletePost(postId);
  } catch (e) {
    console.error("فشل حذف الخاطرة، استعادة الحالة السابقة:", e);
    // تراجع واستعادة المنشورات
    posts.value = originalPosts;
    if (typeof window !== 'undefined') {
      localStorage.setItem('menhaj_cached_posts', JSON.stringify(originalPosts));
    }
  }
};

// إدارة الردود والتعليقات في لوحة المسؤول
const activePostComments = ref<{ [key: string]: any[] }>({});
const openCommentsPostId = ref<string | null>(null);
const activeCommentsUnsubscribes: { [key: string]: () => void } = {};

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

const deleteComment = async (postId: string, commentId: string) => {
  if (typeof window !== 'undefined' && !confirm('هل أنت متأكد من رغبتك في حذف هذا التعليق نهائياً؟')) {
    return;
  }
  const { $firebase } = useNuxtApp();
  
  // تحديث محلي فوري تفاؤلي
  const originalComments = activePostComments.value[postId] ? [...activePostComments.value[postId]] : [];
  if (activePostComments.value[postId]) {
    activePostComments.value[postId] = activePostComments.value[postId].filter(c => c.id !== commentId);
  }
  
  const post = posts.value.find(p => p.id === postId);
  if (post && post.commentsCount) {
    post.commentsCount = Math.max(0, post.commentsCount - 1);
  }

  try {
    await $firebase.deleteComment(postId, commentId);
  } catch (e) {
    console.error("فشل حذف التعليق:", e);
    // تراجع عن التحديث
    if (activePostComments.value[postId]) {
      activePostComments.value[postId] = originalComments;
    }
    if (post && post.commentsCount !== undefined) {
      post.commentsCount = originalComments.length;
    }
  }
};
</script>

<template>
  <div style="max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; font-family: var(--font-arabic);">
    
    <!-- 1. شريط الإدارة العلوي المنسق -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border-feed); padding-bottom: 1.25rem;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 50px; height: 50px; background: var(--color-gold-glow); color: var(--color-secondary); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          <i class="fa-solid fa-user-shield"></i>
        </div>
        <div>
          <h1 style="font-size: 1.6rem; font-weight: 800; color: var(--color-primary); display: flex; align-items: center; gap: 0.5rem;">
            لوحة الإدارة والتحرير
            <span v-if="isAuthenticated" style="font-size: 0.75rem; background: #e6f4ea; color: #137333; padding: 0.15rem 0.5rem; border-radius: 50px; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">
              <span style="width: 6px; height: 6px; background: #137333; border-radius: 50%; display: inline-block; animation: pulse-green 1.5s infinite;"></span>
              نشط حياً
            </span>
          </h1>
          <span style="font-size: 0.85rem; color: var(--text-muted);">إدارة وتحديث الخواطر القرآنية والتفاسير المزامنة مع Firestore</span>
        </div>
      </div>
      
      <div style="display: flex; gap: 0.75rem;">
        <NuxtLink to="/" class="back-btn" style="text-decoration: none; display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.9rem; padding: 0.6rem 1.25rem; border-radius: 10px; border: 1px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main);">
          <i class="fa-solid fa-arrow-right"></i> عرض الخلاصة
        </NuxtLink>
        <button v-if="isAuthenticated" @click="handleLogout" class="back-btn" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.2); font-weight: 700; font-size: 0.9rem; padding: 0.6rem 1.25rem; border-radius: 10px; cursor: pointer;">
          تسجيل الخروج
        </button>
      </div>
    </div>

    <!-- 2. شاشة تسجيل الدخول بتصميم مذهل -->
    <div v-if="!isAuthenticated" style="max-width: 420px; margin: 6rem auto; padding: 2.5rem 2rem; background: var(--bg-secondary); border: 1px solid var(--border-feed); border-radius: 20px; box-shadow: var(--shadow-md); text-align: center;">
      <div style="width: 70px; height: 70px; background: var(--color-gold-glow); color: var(--color-secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin: 0 auto 1.5rem auto;">
        <i class="fa-solid fa-user-shield"></i>
      </div>
      <h3 style="margin-bottom: 0.5rem; font-size: 1.4rem; font-weight: 800;">دخول المشرف أو الناشر</h3>
      <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 2rem;">يرجى تسجيل الدخول بحساب المشرف المعتمد أو بحساب ناشر مصرح له لإدارة ونشر الخلاصة.</p>
      
      <p v-if="authError" style="color: #ef4444; font-size: 0.85rem; margin-bottom: 1.25rem; font-weight: 600;">
        <i class="fa-solid fa-triangle-exclamation"></i> {{ authError }}
      </p>

      <button @click="handleLoginWithGoogle" class="publish-btn" style="width: 100%; padding: 0.9rem; border-radius: 12px; font-size: 1rem; cursor: pointer; border: none; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
        <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        تسجيل الدخول عبر Google
      </button>
    </div>

    <!-- 3. لوحة تحكم الآدمن المنظمة بالكامل -->
    <div v-else>
      <!-- شبكة الإحصائيات المباشرة كبلوكات ملونة متزامنة حياً -->
      <div class="stats-grid">
        <div class="stat-card block-emerald">
          <div class="stat-icon"><i class="fa-solid fa-paper-plane"></i></div>
          <div class="stat-number">{{ totalPostsCount }}</div>
          <div class="stat-title">إجمالي الخواطر المنشورة</div>
        </div>
        <div class="stat-card block-rose">
          <div class="stat-icon"><i class="fa-solid fa-heart"></i></div>
          <div class="stat-number">{{ totalLikesCount }}</div>
          <div class="stat-title">إجمالي الإعجابات الحية</div>
        </div>
        <div class="stat-card block-cyan">
          <div class="stat-icon"><i class="fa-solid fa-comments"></i></div>
          <div class="stat-number">{{ totalCommentsCount }}</div>
          <div class="stat-title">إجمالي الردود والمناقشات</div>
        </div>
        <div class="stat-card block-amber">
          <div class="stat-icon"><i class="fa-solid fa-chart-line"></i></div>
          <div class="stat-number">{{ visitorStats.daily }}</div>
          <div class="stat-title">زيارات اليوم المتجددة حياً</div>
        </div>
      </div>

      <!-- تنبيه النجاح المنسق -->
      <div v-if="showSuccessAlert" style="background: #e6f4ea; border: 1px solid #137333; color: #137333; padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 2rem; font-weight: 700; display: flex; align-items: center; gap: 0.75rem; animation: fadeIn 0.3s;">
        <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
        <span>تم نشر الفائدة وتثبيتها حياً في Firestore بنجاح! تظهر الآن فوراً للزوار.</span>
      </div>

      <!-- العمودان التحريريان بالتساوي -->
      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: start;">
        
        <!-- العمود الأيمن: محرر النشر الجديد -->
        <div class="widget-card" style="border-radius: 20px; border: 1px solid var(--border-feed); padding: 2rem;">
          <h3 class="widget-title" style="font-size: 1.15rem; font-weight: 800; color: var(--color-primary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fa-solid fa-file-pen" style="color: var(--color-secondary);"></i>
            نشر خاطرة أو تدبر جديد
          </h3>
          
          <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            <!-- الكاتب -->
            <div class="form-group">
              <label for="admin-author-input" style="font-weight: 700; font-size: 0.85rem; color: var(--text-muted);">اسم الناشر الإداري</label>
              <input 
                id="admin-author-input"
                type="text" 
                v-model="authorName" 
                style="width: 100%; padding: 0.75rem; border: 1.5px solid var(--border-feed); background: var(--bg-primary); color: var(--text-main); border-radius: 10px; font-family: var(--font-arabic); font-weight: 700; outline: none;"
              />
            </div>

            <!-- المحتوى -->
            <div class="form-group">
              <label for="post-textarea" style="font-weight: 700; font-size: 0.85rem; color: var(--text-muted);">نص الخاطرة القرآنية</label>
              <textarea 
                id="post-textarea"
                v-model="newPostContent" 
                placeholder="اكتب تدبراً بليغاً، فائدة في التفسير، أو لمحة بلاغية حول الآيات..." 
                style="width: 100%; min-height: 150px; border: 1.5px solid var(--border-feed); background: var(--bg-primary); color: var(--text-main); padding: 0.85rem; border-radius: 10px; font-family: var(--font-arabic); font-size: 0.95rem; resize: none; outline: none; line-height: 1.6;"
              ></textarea>
            </div>

            <!-- أداة ربط الآية بالمنشور -->
            <div class="verse-attacher" style="padding: 1rem; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-feed);">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                <input type="checkbox" id="attach-check" v-model="isAttachingVerse" style="width: 16px; height: 16px; accent-color: var(--color-primary); cursor: pointer;" />
                <label for="attach-check" style="font-size: 0.85rem; font-weight: 700; cursor: pointer; color: var(--text-main);">ربط الخاطرة بآية وتفسير ميسر</label>
              </div>
              
              <div v-if="isAttachingVerse" style="display: flex; flex-direction: column; gap: 0.75rem; animation: fadeIn 0.2s;">
              <!-- خيار إدخال آية مخصصة -->
              <div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.25rem;">
                <input type="checkbox" id="admin-custom-verse-check" v-model="isCustomVerse" style="width: 14px; height: 14px; accent-color: var(--color-primary); cursor: pointer;" />
                <label for="admin-custom-verse-check" style="font-size: 0.8rem; font-weight: 700; cursor: pointer; color: var(--text-main);">كتابة أو لصق آية مخصصة</label>
              </div>

              <!-- في حال عدم استخدام آية مخصصة: القوائم الافتراضية -->
              <div v-if="!isCustomVerse" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div class="attacher-selectors" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                  <select class="attacher-select" v-model="attachedSurahId" @change="handleSurahChange" style="padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-weight: 700;">
                    <option v-for="surah in apiSurahs" :key="surah.number" :value="surah.number">
                      سورة {{ surah.name }}
                    </option>
                  </select>
                  <select class="attacher-select" v-model="attachedVerseNumber" style="padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-weight: 700;">
                    <option v-for="n in currentAttachedVersesCount" :key="n" :value="n">
                      آية {{ n }}
                    </option>
                  </select>
                </div>
                <div v-if="isLoadingVerseText" style="text-align: center; padding: 1rem; color: var(--text-muted);">
                  <i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الآية والتفسير...
                </div>
                <div v-else class="attached-preview" style="font-family: var(--font-quran); font-size: 1.25rem; color: var(--color-primary); background: var(--bg-secondary); padding: 0.75rem; border-radius: 8px; border-right: 4px solid var(--color-secondary); text-align: center; line-height: 1.6;">
                  {{ apiVerseText }}
                </div>
              </div>

              <!-- في حال استخدام آية مخصصة: حقول النص الحر ولصق الآيات -->
              <div v-else style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 0.5rem;">
                  <input type="text" v-model="customSurahName" placeholder="اسم السورة (مثال: البقرة)" style="padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem; font-weight: 700;" />
                  <input type="text" v-model="customVerseNumber" placeholder="رقم الآية (مثال: 255)" style="padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-main); font-family: var(--font-arabic); font-size: 0.8rem; font-weight: 700;" />
                </div>
                <textarea v-model="customVerseText" placeholder="اكتب أو الصق نص الآية الكريمة هنا..." style="width: 100%; min-height: 60px; padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--color-primary); font-family: var(--font-quran); font-size: 1.25rem; resize: none; outline: none; text-align: center;"></textarea>
                <textarea v-model="customVerseTafsir" placeholder="اكتب أو الصق التفسير الميسر هنا (اختياري)..." style="width: 100%; min-height: 50px; padding: 0.5rem; border-radius: 8px; border: 1.5px solid var(--border-feed); background: var(--bg-secondary); color: var(--text-muted); font-family: var(--font-arabic); font-size: 0.85rem; resize: none; outline: none;"></textarea>
              </div>
              </div>
            </div>

            <!-- زر النشر المصمم بصورة نشر مخصصة -->
            <button @click="publishPost" :disabled="!newPostContent.trim()" style="padding: 0.5rem; border-radius: 12px; cursor: pointer; border: none; background: transparent; display: flex; align-items: center; justify-content: center; width: 100%; transition: transform 0.2s, opacity 0.2s;" :style="{ opacity: !newPostContent.trim() ? 0.5 : 1 }" onmouseover="if(this.getAttribute('disabled') === null) this.style.transform='scale(1.025)'" onmouseout="this.style.transform='scale(1)'">
              <img src="/publish_icon.png" alt="نشر الخاطرة القرآنية" style="width: 100%; max-width: 260px; height: auto; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.15));" />
            </button>
          </div>
        </div>

        <!-- العمود الأيسر: إدارة المنشورات الحالية وترتيبها كجدول/قائمة أنيقة -->
        <div class="widget-card" style="border-radius: 20px; border: 1px solid var(--border-feed); padding: 2rem;">
          <h3 class="widget-title" style="font-size: 1.15rem; font-weight: 800; color: var(--color-primary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fa-solid fa-list-check" style="color: var(--color-secondary);"></i>
            إدارة وحذف المنشورات الحالية
          </h3>

          <div style="max-height: 550px; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; padding-left: 0.5rem;">
            <!-- تحميل الهيكل مؤقتاً -->
            <div v-if="isLoading && posts.length === 0">
              <div v-for="i in 3" :key="i" class="skeleton-card" style="padding: 1rem 0; border-bottom: 1px solid var(--border-color);">
                <div class="skeleton-body">
                  <div class="skeleton-line title" style="width: 40%; height: 14px;"></div>
                  <div class="skeleton-line text-long" style="height: 12px;"></div>
                  <div class="skeleton-line text-short" style="height: 12px; width: 70%;"></div>
                </div>
              </div>
            </div>

            <!-- قائمة الخواطر الحقيقية المنسقة -->
            <div v-else-if="posts.length > 0" style="display: flex; flex-direction: column; gap: 1rem;">
              <div 
                v-for="post in posts" 
                :key="post.id" 
                :style="{ opacity: post.isPending ? 0.65 : 1 }"
                style="padding: 1.25rem; border: 1.5px solid var(--border-feed); border-radius: 14px; background: var(--bg-primary); display: flex; flex-direction: column; gap: 0.75rem; position: relative; transition: transform 0.2s;"
              >
                <!-- رأس الخاطرة المدارية -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.5rem;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <img :src="post.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.authorName}`" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; background: var(--border-color);" />
                    <span style="font-weight: 700; font-size: 0.9rem; color: var(--color-primary);">{{ post.authorName }}</span>
                  </div>
                  
                  <button 
                    @click="deletePost(post.id)" 
                    style="background: transparent; border: none; color: #f43f5e; cursor: pointer; font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; font-family: var(--font-arabic); padding: 0.25rem 0.5rem; border-radius: 6px;"
                    onmouseover="this.style.background='rgba(244, 63, 94, 0.08)'"
                    onmouseout="this.style.background='transparent'"
                    title="حذف نهائي من السيرفر"
                  >
                    <i class="fa-solid fa-trash-can"></i> حذف
                  </button>
                </div>
                
                <!-- محتوى الخاطرة المختصر -->
                <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-main); white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  {{ post.content }}
                </p>

                <!-- أوسمة التفاعل والإرفاق المنسقة -->
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-muted); padding-top: 0.25rem;">
                  <div style="display: flex; gap: 0.75rem;">
                    <span style="display: flex; align-items: center; gap: 0.25rem;"><i class="fa-solid fa-heart" style="color: #f43f5e;"></i> {{ post.likesCount || 0 }}</span>
                    <button 
                      @click="toggleComments(post.id)"
                      style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; color: var(--text-muted); padding: 0.15rem 0.4rem; border-radius: 6px; font-family: var(--font-arabic);"
                      onmouseover="this.style.background='rgba(6, 182, 212, 0.08)'"
                      onmouseout="this.style.background='transparent'"
                    >
                      <i class="fa-solid fa-comment" style="color: #06b6d4;"></i> 
                      <span>{{ post.commentsCount || 0 }}</span>
                      <span style="font-size: 0.7rem; opacity: 0.8;">({{ openCommentsPostId === post.id ? 'إغلاق' : 'إدارة' }})</span>
                    </button>
                  </div>
                  <span v-if="post.verseRef" style="background: var(--color-gold-glow); color: var(--color-secondary); padding: 0.15rem 0.5rem; border-radius: 50px; font-weight: 600; font-size: 0.75rem;">
                    <i class="fa-solid fa-tag"></i> سورة {{ post.verseRef.surahName }}
                  </span>
                </div>

                <!-- قسم إدارة التعليقات -->
                <div v-if="openCommentsPostId === post.id" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 0.75rem; animation: fadeIn 0.2s;">
                  <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--color-secondary); margin: 0; display: flex; align-items: center; gap: 0.25rem;">
                    <i class="fa-regular fa-comments"></i> التعليقات والردود
                  </h4>
                  
                  <!-- في حال عدم وجود تعليقات بعد تحميلها -->
                  <div v-if="!activePostComments[post.id] || activePostComments[post.id].length === 0" style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 0.5rem;">
                    لا توجد تعليقات على هذا المنشور.
                  </div>
                  
                  <!-- قائمة التعليقات -->
                  <div v-else style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 200px; overflow-y: auto; padding-left: 0.25rem;">
                    <div v-for="comment in activePostComments[post.id]" :key="comment.id" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-feed); gap: 0.5rem;">
                      <div style="display: flex; flex-direction: column; gap: 0.15rem; flex: 1;">
                        <span style="font-weight: 700; font-size: 0.8rem; color: var(--color-primary);">{{ comment.authorName }}</span>
                        <p style="font-size: 0.8rem; margin: 0; color: var(--text-main); white-space: pre-wrap; line-height: 1.4;">{{ comment.content }}</p>
                      </div>
                      <button 
                        @click="deleteComment(post.id, comment.id)" 
                        style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px;"
                        onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'"
                        onmouseout="this.style.background='transparent'"
                        title="حذف التعليق"
                      >
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- لا توجد خواطر -->
            <div v-else style="text-align: center; color: var(--text-muted); padding: 4rem 1rem;">
              <i class="fa-solid fa-inbox" style="font-size: 3rem; color: var(--color-primary); opacity: 0.3; margin-bottom: 0.75rem; display: block;"></i>
              <p style="font-weight: 600;">لا توجد أي منشورات متاحة لإدارتها حالياً.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- إدارة صلاحيات الناشرين (فقط للمشرف العام) -->
      <div v-if="currentUser?.email === 'dirgam55555@gmail.com'" class="widget-card" style="margin-top: 2.5rem; border-radius: 20px; border: 1px solid var(--border-feed); padding: 2rem; background: var(--bg-secondary);">
        <h3 class="widget-title" style="font-size: 1.15rem; font-weight: 800; color: var(--color-primary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-users-gear" style="color: var(--color-secondary);"></i>
          إدارة صلاحيات الناشرين
        </h3>
        
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
          بصفتك المشرف العام، يمكنك منح صلاحية النشر للمستخدمين الآخرين ليظهر لهم صندوق تدوين ونشر الخواطر مباشرة على الصفحة الرئيسية.
        </p>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: right;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-feed); color: var(--text-muted); font-size: 0.85rem; font-weight: 700;">
                <th style="padding: 0.75rem 1rem;">المستخدم</th>
                <th style="padding: 0.75rem 1rem;">البريد الإلكتروني</th>
                <th style="padding: 0.75rem 1rem; text-align: center;">صلاحية النشر بالرئيسية</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in usersList" :key="user.uid" style="border-bottom: 1px solid var(--border-color); font-size: 0.9rem;">
                <td style="padding: 1rem; display: flex; align-items: center; gap: 0.75rem;">
                  <img :src="user.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;" />
                  <span style="font-weight: 700; color: var(--text-main);">{{ user.displayName || 'مستخدم' }}</span>
                </td>
                <td style="padding: 1rem; color: var(--text-muted);">{{ user.email }}</td>
                <td style="padding: 1rem; text-align: center;">
                  <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
                    <!-- منع إلغاء صلاحية المشرف الأساسي نفسه -->
                    <button 
                      v-if="user.email !== 'dirgam55555@gmail.com'"
                      @click="togglePublisher(user.uid, !user.isPublisher)" 
                      :style="{
                        background: user.isPublisher ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                        color: user.isPublisher ? '#10b981' : '#f43f5e',
                        border: '1px solid ' + (user.isPublisher ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)')
                      }"
                      style="padding: 0.4rem 1rem; border-radius: 30px; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; font-family: var(--font-arabic);"
                    >
                      <i :class="user.isPublisher ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i>
                      {{ user.isPublisher ? 'ممنوح (ناشر)' : 'غير مصرح له' }}
                    </button>
                    <span v-else style="background: var(--color-gold-glow); color: var(--color-secondary); padding: 0.3rem 0.75rem; border-radius: 50px; font-weight: 800; font-size: 0.75rem; border: 1px solid rgba(180, 83, 9, 0.2);">
                      <i class="fa-solid fa-crown"></i> مشرف عام
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="usersList.length === 0">
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                  لا يوجد مستخدمون مسجلون حالياً في النظام.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}

.stat-card {
  padding: 1.5rem;
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 125px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  position: absolute;
  left: 1.25rem;
  top: 1.25rem;
  font-size: 2.5rem;
  opacity: 0.2;
  transition: transform 0.3s ease;
}

.stat-card:hover .stat-icon {
  transform: scale(1.15) rotate(-10deg);
  opacity: 0.3;
}

.stat-number {
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1.1;
  margin-bottom: 0.25rem;
  letter-spacing: -1px;
}

.stat-title {
  font-size: 0.95rem;
  font-weight: 600;
  opacity: 0.9;
}

/* ألوان البلوكات */
.block-emerald {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  color: #ffffff;
}

.block-rose {
  background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);
  color: #ffffff;
}

.block-cyan {
  background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
  color: #ffffff;
}

.block-amber {
  background: linear-gradient(135deg, #b45309 0%, #d97706 100%);
  color: #ffffff;
}

body.dark-mode .block-amber {
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
}

.block-indigo {
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  color: #ffffff;
}

@keyframes pulse-green {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(19, 115, 51, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(19, 115, 51, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(19, 115, 51, 0); }
}
</style>
