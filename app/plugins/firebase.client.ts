import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc,
  query,
  where,
  orderBy,
  addDoc,
  increment,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  type User
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDV6PyZBflNVyKELkujLHFA0_MrVNwfrD8",
  authDomain: "menhaj-bd9cd.firebaseapp.com",
  projectId: "menhaj-bd9cd",
  storageBucket: "menhaj-bd9cd.firebasestorage.app",
  messagingSenderId: "710632160954",
  appId: "1:710632160954:web:48f911c38615ae7e4b4c83",
  measurementId: "G-8BL7NS9GKQ"
};

// فئة محاكاة لـ Firestore للمدونة المصغرة (تخزين محلي localStorage)
class MockFirestore {
  // المنشورات
  async getPosts() {
    if (typeof window === 'undefined') return [];
    const posts = localStorage.getItem('menhaj_blog_posts');
    if (!posts) {
      // منشورات نموذجية افتراضية أولية
      const defaultPosts = [
        {
          id: 'post_1',
          userId: 'system',
          authorName: 'د. عبد الرحمن السعدي',
          authorAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=sadi',
          content: 'تأمل في قوله تعالى في سورة الفاتحة {إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ}؛ جمعت هذه الآية بين غاية العبادة ووسيلتها، فلا عبادة مقبولة إلا بالإخلاص لله، ولا سبيل لتحقيقها إلا بالاستعانة به سبحانه وتعالى.',
          verseRef: {
            surahId: 1,
            surahName: "الفاتحة",
            verseNumber: 5,
            text: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
            tafsir: "نخصك وحدك بالعبادة والطاعة، ونستعين بك وحدك في قضاء حوائجنا وديننا ودنيانا."
          },
          likesCount: 12,
          likedBy: [],
          commentsCount: 2,
          createdAt: new Date(Date.now() - 3600000 * 3).toISOString() // منذ 3 ساعات
        },
        {
          id: 'post_2',
          userId: 'system',
          authorName: 'طالب علم',
          authorAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=talib',
          content: 'أعظم آية في كتاب الله تمنحك الأمان المطلق واليقين التام بقرب ورعاية الحي القيوم سبحانه وتعالى.',
          verseRef: {
            surahId: 2,
            surahName: "البقرة",
            verseNumber: 255,
            text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...",
            tafsir: "آية الكرسي الدالة على وحدانية الله وحياته وقيوميته المطلقة."
          },
          likesCount: 8,
          likedBy: [],
          commentsCount: 1,
          createdAt: new Date(Date.now() - 3600000 * 8).toISOString() // منذ 8 ساعات
        }
      ];
      localStorage.setItem('menhaj_blog_posts', JSON.stringify(defaultPosts));
      return defaultPosts;
    }
    return JSON.parse(posts).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createPost(content: string, verseRef: any, authorName: string, userId: string, authorAvatar?: string) {
    if (typeof window === 'undefined') return;
    const posts = await this.getPosts();
    const newPost = {
      id: 'post_' + Math.random().toString(36).substring(2, 11),
      userId,
      authorName,
      authorAvatar: authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${authorName}`,
      content,
      verseRef,
      likesCount: 0,
      likedBy: [],
      commentsCount: 0,
      createdAt: new Date().toISOString()
    };
    posts.unshift(newPost);
    localStorage.setItem('menhaj_blog_posts', JSON.stringify(posts));
    return newPost;
  }

  async toggleLikePost(postId: string, userId: string) {
    if (typeof window === 'undefined') return;
    const posts = await this.getPosts();
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      if (!post.likedBy) post.likedBy = [];
      const likedIndex = post.likedBy.indexOf(userId);
      if (likedIndex > -1) {
        post.likedBy.splice(likedIndex, 1);
        post.likesCount = Math.max(0, post.likesCount - 1);
      } else {
        post.likedBy.push(userId);
        post.likesCount += 1;
      }
      localStorage.setItem('menhaj_blog_posts', JSON.stringify(posts));
    }
  }

  // التعليقات
  async getComments(postId: string) {
    if (typeof window === 'undefined') return [];
    const allComments = localStorage.getItem(`menhaj_comments_${postId}`);
    if (!allComments) {
      const defaultComments = postId === 'post_1' ? [
        { id: 'c1', postId, authorName: 'أحمد القحطاني', content: 'فائدة جليلة جداً بارك الله فيك ونفع بعلمك.', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
        { id: 'c2', postId, authorName: 'سارة خالد', content: 'ما أجمل هذه الآية الكريمة، منهج حياة كامل.', createdAt: new Date(Date.now() - 3600000 * 1).toISOString() }
      ] : [];
      localStorage.setItem(`menhaj_comments_${postId}`, JSON.stringify(defaultComments));
      return defaultComments;
    }
    return JSON.parse(allComments);
  }

  async addComment(postId: string, content: string, authorName: string) {
    if (typeof window === 'undefined') return;
    const comments = await this.getComments(postId);
    const newComment = {
      id: 'comment_' + Math.random().toString(36).substring(2, 11),
      postId,
      authorName,
      content,
      createdAt: new Date().toISOString()
    };
    comments.push(newComment);
    localStorage.setItem(`menhaj_comments_${postId}`, JSON.stringify(comments));

    // تحديث عداد التعليقات في المنشور
    const posts = await this.getPosts();
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.commentsCount = (post.commentsCount || 0) + 1;
      localStorage.setItem('menhaj_blog_posts', JSON.stringify(posts));
    }
    return newComment;
  }

  async deleteComment(postId: string, commentId: string) {
    if (typeof window === 'undefined') return;
    const comments = await this.getComments(postId);
    const filtered = comments.filter((c: any) => c.id !== commentId);
    localStorage.setItem(`menhaj_comments_${postId}`, JSON.stringify(filtered));

    // تحديث عداد التعليقات في المنشور
    const posts = await this.getPosts();
    const post = posts.find((p: any) => p.id === postId);
    if (post) {
      post.commentsCount = Math.max(0, (post.commentsCount || 0) - 1);
      localStorage.setItem('menhaj_blog_posts', JSON.stringify(posts));
    }
  }

  // المفضلة (حفظ المنشورات للرجوع إليها)
  async toggleSavePost(userId: string, postId: string) {
    if (typeof window === 'undefined') return;
    const key = `saved_posts_${userId}`;
    const saved = localStorage.getItem(key);
    let list = saved ? JSON.parse(saved) : [];
    const index = list.indexOf(postId);
    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(postId);
    }
    localStorage.setItem(key, JSON.stringify(list));
  }

  async getSavedPostIds(userId: string) {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(`saved_posts_${userId}`);
    return saved ? JSON.parse(saved) : [];
  }

  async getVisitorStats() {
    if (typeof window === 'undefined') return { total: 4210, daily: 382 };
    let total = Number(localStorage.getItem('menhaj_stats_total') || '4210');
    let daily = Number(localStorage.getItem('menhaj_stats_daily') || '382');
    
    total += 1;
    daily += 1;
    
    localStorage.setItem('menhaj_stats_total', total.toString());
    localStorage.setItem('menhaj_stats_daily', daily.toString());
    
    return { total, daily };
  }

  async syncUserProfile(user: any) {
    if (typeof window === 'undefined') return null;
    const users = JSON.parse(localStorage.getItem('menhaj_users') || '[]');
    let existingUser = users.find((u: any) => u.uid === user.uid);
    if (!existingUser) {
      existingUser = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        isPublisher: user.email === 'dirgam55555@gmail.com'
      };
      users.push(existingUser);
      localStorage.setItem('menhaj_users', JSON.stringify(users));
    }
    return existingUser;
  }

  async getUsers() {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem('menhaj_users') || '[]');
  }

  async setUserPublisherStatus(uid: string, isPublisher: boolean) {
    if (typeof window === 'undefined') return;
    const users = JSON.parse(localStorage.getItem('menhaj_users') || '[]');
    const user = users.find((u: any) => u.uid === uid);
    if (user) {
      user.isPublisher = isPublisher;
      localStorage.setItem('menhaj_users', JSON.stringify(users));
    }
  }

  async checkUserPublisherStatus(uid: string) {
    if (typeof window === 'undefined') return false;
    const users = JSON.parse(localStorage.getItem('menhaj_users') || '[]');
    const user = users.find((u: any) => u.uid === uid);
    return user ? !!user.isPublisher : false;
  }
}

export default defineNuxtPlugin((nuxtApp) => {
let db: any = null;
let auth: any = null;
let isMock = true;
const mockDb = new MockFirestore();

  // محاكاة تسجيل الدخول أوفلاين
  const mockAuth = {
    currentUser: null as any,
    listeners: [] as any[],
    onAuthStateChanged(callback: (user: any) => void) {
      this.listeners.push(callback);
      setTimeout(() => callback(this.currentUser), 50);
      return () => {
        this.listeners = this.listeners.filter(l => l !== callback);
      };
    },
    async signInWithGoogle() {
      const mockUser = {
        uid: 'mock_google_user_123',
        displayName: 'مستخدم تجريبي بجوجل',
        email: 'demo@google.com',
        photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=google_demo'
      };
      this.currentUser = mockUser;
      this.listeners.forEach(l => l(mockUser));
      return mockUser;
    },
    async signOut() {
      this.currentUser = null;
      this.listeners.forEach(l => l(null));
    }
  };

  const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";

  if (isConfigured) {
    try {
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      auth = getAuth(app);
      isMock = false;
      console.log('💚 [Firebase] Firestore and Auth Connected.');
    } catch (error) {
      console.error('🔴 [Firebase] Initialization failed, using offline fallback:', error);
    }
  } else {
    console.warn('⚠️ [Firebase] Using LocalStorage Mock. Set keys in `firebase.client.ts` to sync with Firestore.');
  }

  // توحيد الخدمات للواجهة الأمامية
  const firestoreService = {
    isOffline: () => isMock,

    // إحصائيات الزوار الحقيقية والمتجددة يومياً
    getVisitorStats: async () => {
      const isClient = typeof window !== 'undefined';
      const hasVisitedThisSession = isClient ? sessionStorage.getItem('menhaj_visited_session') : 'true';
      
      if (isMock) {
        if (isClient && !hasVisitedThisSession) {
          sessionStorage.setItem('menhaj_visited_session', 'true');
          return await mockDb.getVisitorStats();
        }
        let total = isClient ? Number(localStorage.getItem('menhaj_stats_total') || '4210') : 4210;
        let daily = isClient ? Number(localStorage.getItem('menhaj_stats_daily') || '382') : 382;
        return { total, daily };
      }

      try {
        const docRef = doc(db, "site_stats", "visitors");
        const docSnap = await getDoc(docRef);
        
        // الحصول على التاريخ الحالي بتوقيت محلي بصيغة YYYY-MM-DD
        const todayStr = new Date().toLocaleDateString('en-CA'); 
        
        if (!docSnap.exists()) {
          const stats = { total: 1, daily: 1, lastResetDate: todayStr };
          await setDoc(docRef, stats);
          if (isClient) sessionStorage.setItem('menhaj_visited_session', 'true');
          return stats;
        }

        const data = docSnap.data();
        const storedDate = data.lastResetDate || '';

        // إذا كان هناك زيارة مسجلة مسبقاً في هذه الجلسة
        if (hasVisitedThisSession === 'true') {
          // نتحقق مما إذا كان التاريخ قد تغير لتصفير العداد اليومي
          if (storedDate !== todayStr) {
            await updateDoc(docRef, {
              daily: 0,
              lastResetDate: todayStr
            });
            const updatedSnap = await getDoc(docRef);
            return updatedSnap.data();
          }
          return data;
        }

        // تسجيل الزيارة الجديدة في الجلسة الحالية
        if (isClient) sessionStorage.setItem('menhaj_visited_session', 'true');

        if (storedDate !== todayStr) {
          // يوم جديد: زيادة الإجمالي وإعادة تعيين اليومي إلى 1
          await updateDoc(docRef, {
            total: increment(1),
            daily: 1,
            lastResetDate: todayStr
          });
        } else {
          // نفس اليوم: زيادة الإجمالي واليومي بـ 1
          await updateDoc(docRef, {
            total: increment(1),
            daily: increment(1)
          });
        }

        const updatedSnap = await getDoc(docRef);
        return updatedSnap.data();
      } catch (e) {
        console.error("Firestore stats error, falling back:", e);
        return { total: 4210, daily: 382 };
      }
    },

    // جلب المنشورات
    getPosts: async () => {
      if (isMock) return await mockDb.getPosts();
      try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const posts: any[] = [];
        snapshot.forEach((doc) => {
          posts.push({ id: doc.id, ...doc.data() });
        });
        return posts;
      } catch (e) {
        console.error("Firestore getPosts error, falling back:", e);
        return await mockDb.getPosts();
      }
    },

    // إنشاء منشور جديد
    createPost: async (content: string, verseRef: any, authorName: string, userId: string, authorAvatar?: string) => {
      if (isMock) return await mockDb.createPost(content, verseRef, authorName, userId, authorAvatar);
      try {
        const postData = {
          userId,
          authorName,
          authorAvatar: authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${authorName}`,
          content,
          verseRef,
          likesCount: 0,
          likedBy: [],
          commentsCount: 0,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "posts"), postData);
        return { id: docRef.id, ...postData };
      } catch (e) {
        console.error("Firestore createPost error:", e);
        return await mockDb.createPost(content, verseRef, authorName, userId, authorAvatar);
      }
    },

    // الإعجاب بالمنشور
    toggleLikePost: async (postId: string, userId: string) => {
      if (isMock) return await mockDb.toggleLikePost(postId, userId);
      try {
        const docRef = doc(db, "posts", postId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const likedBy = data.likedBy || [];
          const hasLiked = likedBy.includes(userId);
          
          if (hasLiked) {
            await updateDoc(docRef, {
              likedBy: arrayRemove(userId),
              likesCount: increment(-1)
            });
          } else {
            await updateDoc(docRef, {
              likedBy: arrayUnion(userId),
              likesCount: increment(1)
            });
          }
        }
      } catch (e) {
        console.error("Firestore toggleLikePost error:", e);
        await mockDb.toggleLikePost(postId, userId);
      }
    },

    // جلب التعليقات (فرز محلي لتخطي متطلبات الفهارس المركبة في Firestore)
    getComments: async (postId: string) => {
      if (isMock) return await mockDb.getComments(postId);
      try {
        const q = query(
          collection(db, "comments"), 
          where("postId", "==", postId)
        );
        const snapshot = await getDocs(q);
        const comments: any[] = [];
        snapshot.forEach((doc) => {
          comments.push({ id: doc.id, ...doc.data() });
        });
        return comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      } catch (e) {
        console.error("Firestore getComments error:", e);
        return await mockDb.getComments(postId);
      }
    },

    // إضافة تعليق
    addComment: async (postId: string, content: string, authorName: string, authorAvatar?: string) => {
      if (isMock) {
        const comments = await mockDb.getComments(postId);
        const newComment = {
          id: 'comment_' + Math.random().toString(36).substring(2, 11),
          postId,
          authorName,
          authorAvatar: authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${authorName}`,
          content,
          createdAt: new Date().toISOString()
        };
        comments.push(newComment);
        localStorage.setItem(`menhaj_comments_${postId}`, JSON.stringify(comments));

        const posts = await mockDb.getPosts();
        const post = posts.find((p: any) => p.id === postId);
        if (post) {
          post.commentsCount = (post.commentsCount || 0) + 1;
          localStorage.setItem('menhaj_blog_posts', JSON.stringify(posts));
        }
        return newComment;
      }
      try {
        const commentData = {
          postId,
          authorName,
          authorAvatar: authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${authorName}`,
          content,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "comments"), commentData);
        
        // زيادة عداد التعليقات في المنشور
        const postRef = doc(db, "posts", postId);
        await updateDoc(postRef, {
          commentsCount: increment(1)
        });

        return { id: docRef.id, ...commentData };
      } catch (e) {
        console.error("Firestore addComment error:", e);
        return await mockDb.addComment(postId, content, authorName);
      }
    },

    // حذف تعليق
    deleteComment: async (postId: string, commentId: string) => {
      if (isMock) return await mockDb.deleteComment(postId, commentId);
      try {
        const commentRef = doc(db, "comments", commentId);
        await deleteDoc(commentRef);
        
        // تقليل عداد التعليقات في المنشور
        const postRef = doc(db, "posts", postId);
        await updateDoc(postRef, {
          commentsCount: increment(-1)
        });
      } catch (e) {
        console.error("Firestore deleteComment error:", e);
        await mockDb.deleteComment(postId, commentId);
      }
    },

    // حفظ المنشور (Bookmark)
    toggleSavePost: async (userId: string, postId: string) => {
      await mockDb.toggleSavePost(userId, postId); // نعتمد محلياً لتسريع تجربة المستخدم وحفظ خياراته الخاصة بالمتصفح
    },

    getSavedPostIds: async (userId: string) => {
      return await mockDb.getSavedPostIds(userId);
    },

    // حذف منشور نهائياً
    deletePost: async (postId: string) => {
      if (isMock) {
        const posts = await mockDb.getPosts();
        const filtered = posts.filter((p: any) => p.id !== postId);
        localStorage.setItem('menhaj_blog_posts', JSON.stringify(filtered));
        return;
      }
      try {
        const docRef = doc(db, "posts", postId);
        await deleteDoc(docRef);
      } catch (e) {
        console.error("Firestore deletePost error:", e);
      }
    },

    // اشتراك حي للمنشورات
    subscribePosts: (callback: (posts: any[]) => void) => {
      if (isMock) {
        mockDb.getPosts().then(callback);
        return () => {};
      }
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snapshot) => {
        const postsList: any[] = [];
        snapshot.forEach((docSnap) => {
          postsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        callback(postsList);
      }, (error) => {
        console.error("Error subscribing to posts:", error);
      });
    },

    // اشتراك حي للتعليقات (فرز محلي لتخطي متطلبات الفهارس المركبة في Firestore)
    subscribeComments: (postId: string, callback: (comments: any[]) => void) => {
      if (isMock) {
        mockDb.getComments(postId).then(callback);
        return () => {};
      }
      const q = query(
        collection(db, "comments"), 
        where("postId", "==", postId)
      );
      return onSnapshot(q, (snapshot) => {
        const commentsList: any[] = [];
        snapshot.forEach((docSnap) => {
          commentsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        commentsList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        callback(commentsList);
      }, (error) => {
        console.error("Error subscribing to comments:", error);
      });
    },

    // اشتراك حي لإحصائيات الزوار
    subscribeStats: (callback: (stats: any) => void) => {
      if (isMock) {
        mockDb.getVisitorStats().then(callback);
        return () => {};
      }
      const docRef = doc(db, "site_stats", "visitors");
      return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
        }
      }, (error) => {
        console.error("Error subscribing to stats:", error);
      });
    },

    // تسجيل الدخول بجوجل
    loginWithGoogle: async () => {
      if (isMock) return await mockAuth.signInWithGoogle();
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        return result.user;
      } catch (e) {
        console.error("Google Auth Error:", e);
        throw e;
      }
    },

    // تسجيل الخروج
    logout: async () => {
      if (isMock) return await mockAuth.signOut();
      try {
        await signOut(auth);
      } catch (e) {
        console.error("Logout Error:", e);
        throw e;
      }
    },

    // متابعة حالة تسجيل الدخول
    onAuthChange: (callback: (user: any) => void) => {
      if (isMock) {
        return mockAuth.onAuthStateChanged(callback);
      }
      return onAuthStateChanged(auth, callback);
    },

    // مزامنة ملف تعريف المستخدم
    syncUserProfile: async (user: any) => {
      if (!user) return null;
      if (isMock) return await mockDb.syncUserProfile(user);
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const profileData = {
            uid: user.uid,
            displayName: user.displayName || 'مستخدم',
            email: user.email || '',
            photoURL: user.photoURL || '',
            isPublisher: user.email === 'dirgam55555@gmail.com' // المشرف الأساسي
          };
          await setDoc(userRef, profileData);
          return profileData;
        } else {
          return userSnap.data();
        }
      } catch (e) {
        console.error("Firestore syncUserProfile error:", e);
        return await mockDb.syncUserProfile(user);
      }
    },

    // اشتراك حي بقائمة المستخدمين (للوحة التحكم)
    subscribeUsers: (callback: (users: any[]) => void) => {
      if (isMock) {
        mockDb.getUsers().then(callback);
        return () => {};
      }
      const q = collection(db, "users");
      return onSnapshot(q, (snapshot) => {
        const usersList: any[] = [];
        snapshot.forEach((docSnap) => {
          usersList.push({ id: docSnap.id, ...docSnap.data() });
        });
        callback(usersList);
      }, (error) => {
        console.error("Error subscribing to users:", error);
      });
    },

    // تعيين صلاحية الناشر
    setUserPublisherStatus: async (uid: string, isPublisher: boolean) => {
      if (isMock) return await mockDb.setUserPublisherStatus(uid, isPublisher);
      try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { isPublisher });
      } catch (e) {
        console.error("Firestore setUserPublisherStatus error:", e);
        await mockDb.setUserPublisherStatus(uid, isPublisher);
      }
    },

    // التحقق من صلاحية الناشر للمستخدم الحالي
    checkUserPublisherStatus: async (uid: string) => {
      if (!uid) return false;
      if (isMock) return await mockDb.checkUserPublisherStatus(uid);
      try {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          return !!userSnap.data().isPublisher;
        }
        return false;
      } catch (e) {
        console.error("Firestore checkUserPublisherStatus error:", e);
        return await mockDb.checkUserPublisherStatus(uid);
      }
    }
  };

  return {
    provide: {
      firebase: firestoreService
    }
  };
});
