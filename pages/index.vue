<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Highlighter, Leaf, List, Maximize2, MessageSquare, Minus, PanelLeftClose, Plus, Settings2, ShieldCheck, Sparkles, StickyNote, Sun, X } from '@lucide/vue';
useHead({ title: 'Margin — A little room to think', htmlAttrs: { lang: 'en' }, meta: [{ name: 'description', content: 'An interactive reading concept with an AI companion, highlights, and notes.' }] });
type Chapter = {
    title: string;
    subtitle: string;
    minutes: number;
    paragraphs: string[];
};
type Note = {
    id: number;
    chapter: number;
    quote: string;
    text: string;
};
type Message = {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    chapter: number;
};
const chapters: Chapter[] = [
    { title: 'An invitation to notice', subtitle: 'The world has not run out of wonders. We have simply become very good at walking past them.', minutes: 4, paragraphs: [
            'On an ordinary Tuesday, I took the long way home. There was no particular reason for it. The sky was the familiar grey of early spring, and I had nothing waiting for me except a half-finished book and a cup of tea.',
            'But on a street I thought I knew, I noticed a tree growing through an old iron fence. Its trunk had folded around the bars, slowly and without complaint. I must have passed it a hundred times. That afternoon was the first time I saw it.',
            'Attention begins this way: not with a grand decision to change our lives, but with a small interruption in the way we see them. Something familiar becomes strange again, and for a moment we are fully here.',
            'This book is an invitation to make room for those moments. There is no special equipment to buy, no perfect morning routine to follow. There is only the world, already offering itself, and the possibility of meeting it a little more openly.',
        ] },
    { title: 'The habit of hurry', subtitle: 'Sometimes we move so quickly through our days that we forget to inhabit them.', minutes: 5, paragraphs: [
            'For years, I measured a good day by how much I could fit inside it. An empty hour seemed like an oversight, a space that ought to be filled. Even rest became something to accomplish efficiently.',
            'Hurry is more than a speed. It is a way of relating to the present as though the important part of life is always about to begin somewhere else. We finish one thing while rehearsing the next.',
            'One morning, waiting for the kettle, I resisted the impulse to pick up my phone. There was the click of the switch, the low gathering sound of water, a square of sunlight moving across the floor. Nothing remarkable happened. Yet the minute felt unexpectedly complete.',
            'Slowing down does not require us to abandon our responsibilities. It asks us to notice the moments when speed has stopped serving us. We can be purposeful without being perpetually elsewhere.',
        ] },
    { title: 'The space between things', subtitle: 'On finding meaning in the moments we usually overlook.', minutes: 6, paragraphs: [
            'There is a particular kind of quiet that arrives just after the rain. The world seems to hold its breath. Water gathers at the tips of leaves, the pavement darkens, and for a brief moment, everything feels newly made.',
            'Most of the time, we walk straight through it. We have somewhere to be, someone to answer, something to finish. Our attention is already a few steps ahead of our bodies, leaning into the next thing.',
            'But what if the spaces between our activities are not empty at all? What if they are where the texture of a life actually lives?',
            'We tend to think of attention as a spotlight: a bright beam we direct toward something important. But attention can also be a window. Instead of narrowing the world, it lets more of the world in.',
            'I began to understand this on my daily walks through the neighbourhood. At first, I treated the walk as a bridge between two useful parts of the day. Then, slowly, I started noticing the small things: a curtain moving in an upstairs window, the smell of bread from a kitchen, the same elderly man tending the same patient roses.',
            'None of these things asked anything of me. They did not need to be photographed, improved, or turned into a lesson. They only asked to be noticed.',
            'And in noticing them, I felt a little less like a visitor in my own life. The day was no longer a series of destinations. It had become a place I could inhabit.',
        ] },
    { title: 'Learning to look again', subtitle: 'Familiarity can close our eyes. Curiosity opens them.', minutes: 5, paragraphs: [
            'Choose something you see every day: a cup, a doorway, the view from your window. Look at it for a little longer than feels necessary. Notice the places where your mind says, I already know this.',
            'Knowing the name of a thing is useful, but it can also become a stopping point. A tree becomes simply a tree. We forget the particular way its branches hold the sky, or the different greens that gather on a single leaf.',
            'Curiosity does not demand that everything be extraordinary. It asks a gentler question: what have I not noticed yet? The answer can be small. A worn edge. A change in light. The sound a familiar door makes as it closes.',
            'Looking again is a practice of allowing the familiar to surprise us. Nothing outside us has to change for our experience of it to become richer.',
        ] },
    { title: 'A life with room in it', subtitle: 'Not every space needs filling. Some need protecting.', minutes: 4, paragraphs: [
            'By the end of that spring, my days looked much the same from the outside. I still worked, bought groceries, forgot to reply to messages. Attention had not made my life flawless. It had made it feel more like mine.',
            'I had begun leaving small margins: a few minutes before an appointment, a walk without headphones, an evening with no plan beyond seeing how it unfolded. These were not rewards for finishing everything. They were part of the day itself.',
            'A life with room in it is not necessarily a quiet life. It can be busy, complicated, and full of people. The room is in how we meet it: with enough openness to be surprised, and enough patience to remain.',
            'Tomorrow, something ordinary will offer itself to your attention. A sound, a face, a patch of light. You do not need to hold onto it. For a moment, simply be there.',
        ] },
];
const chapterIndex = ref(2);
const chapter = computed(() => chapters[chapterIndex.value]!);
const progress = computed(() => Math.round((chapterIndex.value + 1) / chapters.length * 100));
const leftTab = ref<'contents' | 'notes'>('contents');
const sidebarOpen = ref(false);
const aiOpen = ref(true);
const focusMode = ref(false);
const fontSize = ref(19);
const spacious = ref(true);
const theme = ref<'paper' | 'white' | 'night'>('paper');
const themes = ['paper', 'white', 'night'] as const;
const bookmarked = ref(false);
const defaultQuote = 'But attention can also be a window. Instead of narrowing the world, it lets more of the world in.';
const selectedQuote = ref(defaultQuote);
const highlights = ref<Record<number, string[]>>({ 2: [defaultQuote] });
const notes = ref<Note[]>([{ id: 1, chapter: 2, quote: defaultQuote, text: 'A lovely distinction. Try the “window” approach on tomorrow’s walk.' }]);
const noteDraft = ref('');
const editingNoteId = ref<number | null>(null);
const noteDialog = ref<HTMLDialogElement | null>(null);
const settingsDialog = ref<HTMLDialogElement | null>(null);
const libraryDialog = ref<HTMLDialogElement | null>(null);
const readingScroll = ref<HTMLElement | null>(null);
const readingArticle = ref<HTMLElement | null>(null);
const aiPanel = ref<HTMLElement | null>(null);
const conversation = ref<HTMLElement | null>(null);
const question = ref('');
const announcement = ref('');
const messages = ref<Message[]>([]);
const quoteIsHighlighted = computed(() => (highlights.value[chapterIndex.value] || []).includes(selectedQuote.value));
function announce(text: string) { announcement.value = text; }
function goToChapter(index: number) {
    if (index < 0 || index >= chapters.length)
        return;
    chapterIndex.value = index;
    selectedQuote.value = index === 2 ? defaultQuote : chapters[index]!.paragraphs[3]!;
    sidebarOpen.value = false;
    nextTick(() => { readingScroll.value?.scrollTo({ top: 0 }); readingArticle.value?.focus({ preventScroll: true }); });
    announce(`Chapter ${index + 1}: ${chapter.value.title}`);
}
function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 2 && selection?.anchorNode && selection.focusNode && readingArticle.value?.contains(selection.anchorNode) && readingArticle.value.contains(selection.focusNode)) {
        if (chapter.value.paragraphs.some(p => p.includes(text)))
            selectedQuote.value = text;
        else
            announce('Choose text within one paragraph to highlight it.');
    }
}
function paragraphParts(paragraph: string) {
    const ranges = (highlights.value[chapterIndex.value] || []).map(q => ({ start: paragraph.indexOf(q), end: paragraph.indexOf(q) + q.length })).filter(r => r.start >= 0).sort((a, b) => a.start - b.start);
    const parts: {
        text: string;
        marked: boolean;
    }[] = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start < cursor)
            continue;
        if (range.start > cursor)
            parts.push({ text: paragraph.slice(cursor, range.start), marked: false });
        parts.push({ text: paragraph.slice(range.start, range.end), marked: true });
        cursor = range.end;
    }
    if (cursor < paragraph.length)
        parts.push({ text: paragraph.slice(cursor), marked: false });
    return parts;
}
function toggleHighlight() {
    const current = highlights.value[chapterIndex.value] || [];
    const remove = quoteIsHighlighted.value;
    highlights.value[chapterIndex.value] = remove ? current.filter(q => q !== selectedQuote.value) : [...current.filter(q => !q.includes(selectedQuote.value) && !selectedQuote.value.includes(q)), selectedQuote.value];
    announce(remove ? 'Highlight removed.' : 'Passage highlighted for this session.');
}
function openNote() { editingNoteId.value = null; noteDraft.value = ''; noteDialog.value?.showModal(); }
function editNote(note: Note) {
    goToChapter(note.chapter);
    selectedQuote.value = note.quote;
    noteDraft.value = note.text;
    editingNoteId.value = note.id;
    noteDialog.value?.showModal();
}
function saveResponseAsNote() {
    editingNoteId.value = null;
    selectedQuote.value = chapter.value.paragraphs[3]!;
    noteDraft.value = chapterIndex.value === 2 ? 'Attention can be receptive, not just focused. Sometimes noticing is enough.' : chapter.value.subtitle;
    noteDialog.value?.showModal();
}
function saveNote() {
    if (!noteDraft.value.trim())
        return;
    if (editingNoteId.value !== null) {
        notes.value = notes.value.map(note => note.id === editingNoteId.value ? { ...note, text: noteDraft.value.trim() } : note);
    }
    else {
        notes.value.push({ id: Date.now(), chapter: chapterIndex.value, quote: selectedQuote.value, text: noteDraft.value.trim() });
    }
    noteDialog.value?.close();
    leftTab.value = 'notes';
    announce('Note saved for this session. Find it in My notes.');
}
function revealAi() {
    aiOpen.value = true;
    focusMode.value = false;
    nextTick(() => { aiPanel.value?.scrollIntoView({ behavior: 'instant', block: 'nearest' }); aiPanel.value?.focus({ preventScroll: true }); });
}
function toggleAi() {
    if (window.matchMedia('(max-width: 767px)').matches || focusMode.value || !aiOpen.value)
        revealAi();
    else
        aiOpen.value = false;
}
function askAssistant(prompt?: string) {
    const text = (prompt || question.value).trim();
    if (!text)
        return;
    revealAi();
    const id = Date.now();
    messages.value.push({ id, role: 'user', text, chapter: chapterIndex.value });
    let reply = `In “${chapter.value.title},” the author invites us to notice familiar experiences more deliberately. The passage “${selectedQuote.value}” is a useful starting point: pause with it, then consider an ordinary moment from your own day.`;
    if (/summar/i.test(text))
        reply = `This chapter explores ${chapter.value.subtitle.charAt(0).toLowerCase() + chapter.value.subtitle.slice(1)} Its central invitation is to pause, notice what is already around you, and experience everyday life more fully.`;
    else if (/practice|try|apply/i.test(text))
        reply = 'Try this on your next walk: put your phone away for two minutes. Notice one sound, one texture, and one small movement. You do not need to record or judge them. Simply let them be part of your experience.';
    else if (chapterIndex.value === 2 && /explain|window|mean/i.test(text))
        reply = 'A spotlight selects one thing and leaves the rest in darkness. A window opens a broader view. The author uses this contrast to describe two kinds of attention: concentrating on a task, and staying receptive to the small details around you. Neither is wrong; the invitation is to make room for both.';
    messages.value.push({ id: id + 1, role: 'assistant', text: reply, chapter: chapterIndex.value });
    question.value = '';
    announce('Demo response ready. Responses are illustrative, not generated by a live AI.');
    nextTick(() => conversation.value?.scrollTo({ top: conversation.value.scrollHeight, behavior: 'instant' }));
}
function showPassage(index = chapterIndex.value) {
    if (index !== chapterIndex.value)
        goToChapter(index);
    nextTick(() => { const el = readingArticle.value?.querySelector<HTMLElement>('[data-passage]'); el?.scrollIntoView({ behavior: 'instant', block: 'center' }); el?.focus({ preventScroll: true }); });
}
</script>

<template>
  <div class="reader-app" :class="[`theme-${theme}`, { 'is-focused': focusMode, 'ai-hidden': !aiOpen }]">
    <a class="skip-link" href="#book-content">Skip to reading</a>
    <header class="app-header">
      <a href="#" class="brand" aria-label="Margin home" @click.prevent="libraryDialog?.showModal()"><BookOpen aria-hidden="true" :size="24" />margin<span>.</span></a>
      <div class="header-breadcrumb">
        <span>My library <ChevronRight aria-hidden="true" :size="13" /></span>
        The Art of Paying Attention
        <small>BOOK</small>
      </div>
      <div class="header-actions">
        <span class="demo-badge"><i /> Interactive demo</span>
        <span class="avatar" aria-label="Reader profile">JD</span>
      </div>
    </header>
    <div class="workspace">
      <aside class="library-panel" :class="{ 'mobile-open': sidebarOpen }" aria-label="Book navigation">
        <div class="library-top">
          <button class="text-button" @click="libraryDialog?.showModal()"><ArrowLeft aria-hidden="true" :size="15" /> My library</button>
          <button class="icon-button mobile-close" aria-label="Close contents" @click="sidebarOpen = false"><X aria-hidden="true" :size="17" /></button>
          <BookOpen aria-hidden="true" class="desktop-book-icon" :size="16" />
        </div>
        <div class="book-summary">
          <div class="book-cover" aria-hidden="true">
            <span class="cover-kicker">THE ART OF</span>
            <span class="cover-title">Paying<br>Attention</span>
            <div class="cover-illustration">
              <i />
              <i />
              <i />
              <span />
            </div>
            <span class="cover-author">ELEANOR HAYES</span>
          </div>
          <h2>The Art of Paying Attention</h2>
          <p>Eleanor Hayes</p>
          <div class="book-category">
            <Leaf aria-hidden="true" :size="12" />
            Mindful living
            <span>·</span>
            2025
          </div>
        </div>
        <div class="sidebar-tabs" aria-label="Book panels">
          <button :class="{ active: leftTab === 'contents' }" :aria-pressed="leftTab === 'contents'" @click="leftTab = 'contents'">Contents</button>
          <button :class="{ active: leftTab === 'notes' }" :aria-pressed="leftTab === 'notes'" @click="leftTab = 'notes'">My notes <span>{{ notes.length }}</span></button>
        </div>
        <nav v-if="leftTab === 'contents'" class="chapter-list" aria-label="Table of contents">
          <span class="eyebrow contents-label">IN THIS BOOK</span>
          <button v-for="(item, index) in chapters" :key="item.title" class="chapter-link" :class="{ current: index === chapterIndex }" :aria-current="index === chapterIndex ? 'location' : undefined" @click="goToChapter(index)"><span class="chapter-number">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ item.title }}</span><i v-if="index === chapterIndex" class="current-dot" /></button>
          <div class="ornament end-mark">
            <span />
            <Leaf aria-hidden="true" :size="13" />
            <span />
          </div>
        </nav>
        <div v-else class="notes-list">
          <p class="session-note">Notes stay in this demo session.</p>
          <article v-for="note in notes" :key="note.id" class="saved-note">
            <button class="note-location" @click="goToChapter(note.chapter)">Chapter {{ note.chapter + 1 }} <ArrowUp aria-hidden="true" :size="12" /></button>
            <blockquote>{{ note.quote }}</blockquote>
            <p>{{ note.text }}</p>
            <button class="text-button edit-note" @click="editNote(note)">Edit note</button>
            <button class="text-button delete-note" @click="notes = notes.filter(n => n.id !== note.id); announce('Note deleted.')">Remove note</button>
          </article>
          <p v-if="!notes.length" class="session-note">Your thoughts belong here. Use “Add note” while reading.</p>
        </div>
        <div class="sidebar-bottom">
          <div class="progress-label">
            <span>Your journey</span>
            <strong>{{ progress }}%</strong>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-valuenow="progress"
            :aria-valuemin="0"
            :aria-valuemax="100"
            aria-label="Chapter progress"
          >
            <span :style="{ width: `${progress}%` }" />
          </div>
          <p>Chapter {{ chapterIndex + 1 }} of {{ chapters.length }} <em>Keep a little room for wonder.</em></p>
        </div>
      </aside>
      <main class="reader-main">
        <div class="reader-toolbar">
          <div class="toolbar-group">
            <button class="icon-button contents-toggle" :aria-expanded="sidebarOpen" aria-label="Toggle contents" @click="sidebarOpen = !sidebarOpen"><List aria-hidden="true" :size="18" /></button>
            <span class="chapter-toolbar-label">CHAPTER {{ String(chapterIndex + 1).padStart(2, '0') }}</span>
            <span class="toolbar-divider" />
            <span class="reading-time">{{ chapter.minutes }} min read</span>
          </div>
          <div class="toolbar-group">
            <button class="icon-button" :class="{ 'is-active': bookmarked }" :aria-pressed="bookmarked" :aria-label="bookmarked ? 'Remove bookmark' : 'Bookmark this book'" @click="bookmarked = !bookmarked; announce(bookmarked ? 'Book bookmarked for this session.' : 'Bookmark removed.')"><Bookmark aria-hidden="true" :size="17" :fill="bookmarked ? 'currentColor' : 'none'" /></button>
            <button class="icon-button" aria-label="Reading appearance" @click="settingsDialog?.showModal()"><Settings2 aria-hidden="true" :size="18" /></button>
            <button class="icon-button focus-toggle" :aria-pressed="focusMode" :aria-label="focusMode ? 'Exit focus mode' : 'Enter focus mode'" @click="focusMode = !focusMode"><Maximize2 aria-hidden="true" :size="17" /></button>
            <span class="toolbar-divider" />
            <button class="ai-toggle" :aria-pressed="aiOpen && !focusMode" aria-label="Open or close AI companion" @click="toggleAi"><Sparkles aria-hidden="true" :size="16" /><span>AI companion</span></button>
          </div>
        </div>
        <div ref="readingScroll" class="reading-scroll">
          <article
            id="book-content"
            ref="readingArticle"
            class="book-article"
            tabindex="-1"
            :style="{ '--reading-size': `${fontSize}px`, '--reading-leading': spacious ? '1.8' : '1.6' }"
            @mouseup="captureSelection"
            @keyup.shift="captureSelection"
          >
            <div class="chapter-heading">
              <span class="chapter-eyebrow"><i /> THE ART OF PAYING ATTENTION</span>
              <p class="chapter-overline">Chapter {{ ['One', 'Two', 'Three', 'Four', 'Five'][chapterIndex] }}</p>
              <h1>{{ chapter.title }}</h1>
              <p class="chapter-subtitle">{{ chapter.subtitle }}</p>
              <div class="ornament chapter-ornament">
                <span />
                <Leaf aria-hidden="true" :size="16" />
                <span />
              </div>
            </div>
            <div class="prose-content">
              <template v-for="(paragraph, index) in chapter.paragraphs" :key="`${chapterIndex}-${index}`">
                <p :class="{ 'opening-paragraph': index === 0 }" :data-passage="index === 3 ? '' : undefined" :tabindex="index === 3 ? -1 : undefined"><template v-for="(part, partIndex) in paragraphParts(paragraph)" :key="partIndex"><mark v-if="part.marked">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></p>
                <div v-if="index === 3" class="passage-actions" aria-label="Passage actions">
                  <button @click="askAssistant('Explain this passage')"><Sparkles aria-hidden="true" :size="14" /> Ask AI</button>
                  <i />
                  <button :aria-pressed="quoteIsHighlighted" @click="toggleHighlight"><Highlighter aria-hidden="true" :size="14" /> {{ quoteIsHighlighted ? 'Highlighted' : 'Highlight' }}<Check aria-hidden="true" v-if="quoteIsHighlighted" :size="12" /></button>
                  <i />
                  <button @click="openNote"><StickyNote aria-hidden="true" :size="14" /> Add note</button>
                </div>
              </template>
            </div>
            <div class="ornament chapter-end">
              <span />
              <Leaf aria-hidden="true" :size="17" />
              <span />
            </div>
            <p class="reading-hint"><Highlighter aria-hidden="true" :size="13" /> Select a passage to make it your own. <button @click="openNote">Or add a note.</button></p>
            <div class="article-navigation">
              <button :disabled="chapterIndex === 0" class="text-button" @click="goToChapter(chapterIndex - 1)"><ArrowLeft aria-hidden="true" :size="15" /> Previous chapter</button>
              <button :disabled="chapterIndex === chapters.length - 1" class="text-button" @click="goToChapter(chapterIndex + 1)">Next chapter <ArrowRight aria-hidden="true" :size="15" /></button>
            </div>
          </article>
        </div>
        <footer class="reader-footer">
          <span><i class="tiny-dot" /> A little room to think.</span>
          <div>
            <button class="icon-button" aria-label="Previous chapter" :disabled="chapterIndex === 0" @click="goToChapter(chapterIndex - 1)"><ChevronLeft aria-hidden="true" :size="16" /></button>
            <span>{{ chapterIndex + 1 }} <span class="footer-of">/ {{ chapters.length }} chapters</span></span>
            <button class="icon-button" aria-label="Next chapter" :disabled="chapterIndex === chapters.length - 1" @click="goToChapter(chapterIndex + 1)"><ChevronRight aria-hidden="true" :size="16" /></button>
          </div>
          <button class="text-button footer-appearance" @click="settingsDialog?.showModal()"><Sun aria-hidden="true" :size="14" /> {{ theme === 'night' ? 'Night' : theme === 'paper' ? 'Paper' : 'Light' }}</button>
        </footer>
      </main>
      <aside v-if="aiOpen" ref="aiPanel" class="ai-panel" aria-label="AI reading companion" tabindex="-1">
        <div class="ai-panel-header">
          <div class="ai-heading">
            <span class="sparkle-box"><Sparkles aria-hidden="true" :size="18" /></span>
            <div>
              <h2>Your reading companion</h2>
              <p>A little clarity, when you need it.</p>
            </div>
          </div>
          <button class="icon-button" aria-label="Close AI companion" @click="aiOpen = false"><PanelLeftClose aria-hidden="true" :size="17" class="rotate-180" /></button>
        </div>
        <div class="ai-tabs">
          <span><MessageSquare aria-hidden="true" :size="14" /> Conversation</span>
          <small>DEMO</small>
        </div>
        <div ref="conversation" class="conversation">
          <div class="context-card">
            <div>
              <BookOpen aria-hidden="true" :size="14" />
              <span>READING WITH YOU</span>
              <i />
            </div>
            <strong>Chapter {{ chapterIndex + 1 }} · {{ chapter.title }}</strong>
            <p>Answers stay within this chapter.</p>
          </div>
          <div class="conversation-divider">
            <span />
            A THOUGHT TO EXPLORE
            <span />
          </div>
          <div class="user-prompt">
            <span class="small-avatar">JD</span>
            <p>{{ chapterIndex === 2 ? 'What does the author mean by attention being a “window”?' : 'What should I take away from this chapter?' }}</p>
          </div>
          <div class="assistant-response">
            <div class="assistant-byline">
              <Sparkles aria-hidden="true" :size="15" />
              <strong>Margin AI</strong>
              <span>Sample response</span>
            </div>
            <template v-if="chapterIndex === 2">
              <p>It’s a lovely shift in perspective.</p>
              <p>A <strong>spotlight</strong> narrows your focus to one thing. A <strong>window</strong> lets you take in what’s already around you, without deciding what matters first.</p>
              <blockquote>“Instead of narrowing the world, it lets more of the world in.”<button @click="showPassage()">Chapter 3 <ArrowUp aria-hidden="true" :size="11" /></button></blockquote>
              <p>The invitation is to be <em>receptive</em>, not just focused. Sometimes noticing is enough.</p>
            </template>
            <template v-else>
              <p>{{ chapter.subtitle }}</p>
              <p>The author invites you to slow down and make space for ordinary experiences. Try noticing one familiar thing with fresh attention today.</p>
            </template>
            <button class="save-response" @click="saveResponseAsNote"><StickyNote aria-hidden="true" :size="13" /> Save as a note <Plus aria-hidden="true" :size="12" /></button>
          </div>
          <template v-for="message in messages" :key="message.id">
            <div v-if="message.role === 'user'" class="user-prompt added-message">
              <span class="small-avatar">JD</span>
              <p>{{ message.text }}</p>
            </div>
            <div v-else class="assistant-response">
              <div class="assistant-byline">
                <Sparkles aria-hidden="true" :size="15" />
                <strong>Margin AI</strong>
                <span>Demo response</span>
              </div>
              <p>{{ message.text }}</p>
              <button class="source-link" @click="showPassage(message.chapter)">View chapter {{ message.chapter + 1 }} <ArrowUp aria-hidden="true" :size="12" /></button>
            </div>
          </template>
          <div class="suggestions">
            <span>KEEP EXPLORING</span>
            <button @click="askAssistant('How can I put this into practice?')">How can I put this into practice? <ArrowRight aria-hidden="true" :size="13" /></button>
            <button @click="askAssistant('Summarize this chapter')">Summarize this chapter <ArrowRight aria-hidden="true" :size="13" /></button>
          </div>
        </div>
        <div class="composer-area">
          <div class="spoiler-note">
            <ShieldCheck aria-hidden="true" :size="13" />
            No spoilers. Just this chapter.
          </div>
          <form class="composer" @submit.prevent="askAssistant()">
            <label for="ai-question" class="sr-only">Ask about this chapter</label>
            <textarea id="ai-question" v-model="question" placeholder="A question, a thought, a little curiosity…" rows="2" maxlength="1000" @keydown.enter.exact.prevent="askAssistant()" />
            <div class="composer-bottom">
              <span><BookOpen aria-hidden="true" :size="12" /> Chapter {{ chapterIndex + 1 }} context</span>
              <button type="submit" :disabled="!question.trim()" aria-label="Send message"><ArrowUp aria-hidden="true" :size="17" /></button>
            </div>
          </form>
          <p class="demo-disclaimer">Illustrative AI replies · Notes last for this session</p>
        </div>
      </aside>
    </div>
    <div class="sr-only" role="status" aria-live="polite">
      {{ announcement }}
    </div>
    <dialog
      ref="noteDialog"
      class="reader-dialog"
      aria-labelledby="note-title"
      @click="($event.target === noteDialog) && noteDialog?.close()"
    >
      <form @submit.prevent="saveNote">
        <div class="dialog-header">
          <h2 id="note-title">A thought worth keeping</h2>
          <button type="button" class="icon-button" aria-label="Close note" @click="noteDialog?.close()"><X aria-hidden="true" :size="19" /></button>
        </div>
        <p class="dialog-description">Chapter {{ chapterIndex + 1 }} · {{ chapter.title }}</p>
        <blockquote class="note-quote">{{ selectedQuote }}</blockquote>
        <label class="field-label" for="note-text">Your note</label>
        <textarea id="note-text" v-model="noteDraft" class="note-input" rows="4" placeholder="What does this bring to mind?" required maxlength="2000" />
        <p class="session-note">Saved in this demo session only.</p>
        <div class="dialog-actions">
          <button type="button" class="secondary-button" @click="noteDialog?.close()">Cancel</button>
          <button class="primary-button" type="submit" :disabled="!noteDraft.trim()"><Check aria-hidden="true" :size="15" /> Save note</button>
        </div>
      </form>
    </dialog>
    <dialog
      ref="settingsDialog"
      class="reader-dialog"
      aria-labelledby="settings-title"
      @click="($event.target === settingsDialog) && settingsDialog?.close()"
    >
      <div class="dialog-header">
        <h2 id="settings-title">Make yourself comfortable</h2>
        <button class="icon-button" aria-label="Close reading settings" @click="settingsDialog?.close()"><X aria-hidden="true" :size="19" /></button>
      </div>
      <p class="dialog-description">A reading space that feels like yours.</p>
      <div class="setting-row">
        <span>Text size</span>
        <div class="size-controls">
          <button class="icon-button" :disabled="fontSize <= 16" aria-label="Decrease text size" @click="fontSize--"><Minus aria-hidden="true" :size="16" /></button>
          <output aria-live="polite">{{ fontSize }}px</output>
          <button class="icon-button" :disabled="fontSize >= 26" aria-label="Increase text size" @click="fontSize++"><Plus aria-hidden="true" :size="16" /></button>
        </div>
      </div>
      <div class="setting-row">
        <span>Line spacing</span>
        <button class="secondary-button" :aria-pressed="spacious" @click="spacious = !spacious">{{ spacious ? 'Relaxed' : 'Compact' }} <ChevronDown aria-hidden="true" :size="14" /></button>
      </div>
      <fieldset class="theme-fieldset">
        <legend>Page color</legend>
        <div class="theme-options">
          <button v-for="option in themes" :key="option" :class="[`swatch-${option}`, { chosen: theme === option }]" :aria-pressed="theme === option" @click="theme = option"><span>Aa</span>{{ option === 'white' ? 'Light' : option === 'paper' ? 'Paper' : 'Night' }}<Check aria-hidden="true" v-if="theme === option" :size="13" /></button>
        </div>
      </fieldset>
    </dialog>
    <dialog
      ref="libraryDialog"
      class="reader-dialog"
      aria-labelledby="library-title"
      @click="($event.target === libraryDialog) && libraryDialog?.close()"
    >
      <div class="dialog-header">
        <h2 id="library-title">Your little library</h2>
        <button class="icon-button" aria-label="Close library" @click="libraryDialog?.close()"><X aria-hidden="true" :size="19" /></button>
      </div>
      <p class="dialog-description">One good book. A little room to think.</p>
      <button class="library-book" @click="libraryDialog?.close()"><span class="mini-cover"><BookOpen aria-hidden="true" :size="27" /></span><span><strong>The Art of Paying Attention</strong><small>Eleanor Hayes · Original demo text</small><span>Continue chapter {{ chapterIndex + 1 }} <ArrowRight aria-hidden="true" :size="14" /></span></span></button>
      <p class="session-note">This visual demo includes one sample book.</p>
    </dialog>
  </div>
</template>

<style scoped>
.reader-app {
  --background: #faf9f6;
  --sidebar: #f4f3ef;
  --card: #fffefa;
  --foreground: #303b35;
  --muted-foreground: #6f756e;
  --border: #e5e6df;
  --primary: #486450;
  --accent: #e9eee5;
  --paper: var(--background);
  --panel: var(--sidebar);
  --surface: var(--card);
  --ink: var(--foreground);
  --subtle: var(--muted-foreground);
  --line: var(--border);
  --green: var(--primary);
  --green-soft: var(--accent);
  --highlight: #f2e8b8;
  --highlight-ink: #42412b;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  min-height: 100dvh;
}

.theme-white {
  --background: #fff;
  --sidebar: #f7f8f7;
  --card: #fff;
}

.theme-night {
  --background: #202822;
  --sidebar: #1b231e;
  --card: #28312a;
  --foreground: #e0e5dc;
  --muted-foreground: #a3afa3;
  --border: #3a453c;
  --primary: #b0cba9;
  --accent: #344336;
  --highlight: #625b32;
  --highlight-ink: #fff1b7;
}

button, a {
  -webkit-tap-highlight-color: transparent;
}

button {
  cursor: pointer;
  transition: background-color .15s, color .15s;
}

button:disabled {
  cursor: not-allowed;
  opacity: .35;
}

button:focus-visible, a:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 4px;
}

svg {
  flex-shrink: 0;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  color: var(--subtle);
  flex-shrink: 0;
}

.icon-button:hover, .text-button:hover {
  background: var(--green-soft);
  color: var(--green);
}

.is-active {
  color: var(--green);
  background: var(--green-soft);
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 5px;
  padding: 6px 3px;
  font-size: 12px;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: -70px;
  z-index: 100;
  background: var(--green);
  color: var(--paper);
  padding: 12px 18px;
  border-radius: 5px;
}

.skip-link:focus {
  top: 12px;
}

.app-header {
  height: 68px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  padding: 0 28px;
  gap: 30px;
}

.brand {
  display: flex;
  align-items: center;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -1.6px;
  min-width: 178px;
}

.brand svg {
  margin-right: 12px;
  color: var(--green);
}

.brand > span {
  color: var(--green);
}

.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 12px;
  min-width: 0;
}

.header-breadcrumb > span {
  color: var(--subtle);
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-breadcrumb small {
  font-size: 9px;
  letter-spacing: .6px;
  border: 1px solid var(--line);
  color: var(--subtle);
  border-radius: 4px;
  padding: 2px 5px;
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-shrink: 0;
}

.demo-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--subtle);
}

.demo-badge i, .tiny-dot {
  width: 5px;
  height: 5px;
  background: #8da086;
  border-radius: 50%;
  display: inline-block;
}

.avatar {
  width: 31px;
  height: 31px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #e9e4dc;
  color: #655d50;
  font-size: 10px;
  font-weight: 600;
  border: 3px solid var(--surface);
  outline: 1px solid var(--line);
}

.workspace {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr) 340px;
  height: calc(100dvh - 68px);
  max-width: 1920px;
  margin: auto;
}

.library-panel {
  background: var(--panel);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}

.library-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 23px 0;
  color: var(--subtle);
}

.book-summary {
  padding: 23px 22px 25px;
}

.book-cover {
  position: relative;
  width: 116px;
  height: 162px;
  margin: 0 auto 22px;
  background: #425344;
  color: #eee9d8;
  border-radius: 2px 5px 5px 2px;
  box-shadow: 5px 8px 14px #26382b20, inset 4px 0 0 #ffffff0a, inset 7px 0 0 #0000000d;
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 16px 9px 10px;
  overflow: hidden;
}

.cover-kicker {
  font-size: 6px;
  letter-spacing: 2.4px;
  margin-bottom: 6px;
}

.cover-title {
  font-family: Georgia, serif;
  text-align: center;
  line-height: 1.03;
  font-size: 24px;
  letter-spacing: -.8px;
  z-index: 1;
}

.cover-author {
  margin-top: auto;
  font-size: 5px;
  letter-spacing: 1.5px;
  z-index: 1;
}

.cover-illustration {
  position: absolute;
  width: 100px;
  height: 68px;
  left: 10px;
  top: 82px;
  overflow: hidden;
}

.cover-illustration i {
  position: absolute;
  width: 60px;
  height: 100px;
  border: 1px solid #c3c9a17a;
  border-radius: 50%;
  transform: rotate(-25deg);
  top: 4px;
  left: 32px;
}

.cover-illustration i:nth-child(2) {
  transform: rotate(-46deg);
  left: 12px;
  top: 15px;
}

.cover-illustration i:nth-child(3) {
  transform: rotate(20deg);
  left: 43px;
  top: 14px;
}

.cover-illustration span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #c4be8c;
  position: absolute;
  top: 13px;
  left: 18px;
  opacity: .7;
}

.book-summary h2 {
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
  max-width: 180px;
}

.book-summary > p {
  color: var(--subtle);
  font-size: 12px;
  margin-top: 5px;
}

.book-category {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--subtle);
  font-size: 10px;
  margin-top: 12px;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
  margin: 0 20px;
  gap: 23px;
}

.sidebar-tabs button {
  padding: 12px 0;
  border-bottom: 2px solid transparent;
  color: var(--subtle);
  font-size: 12px;
}

.sidebar-tabs button.active {
  color: var(--green);
  border-bottom-color: var(--green);
  font-weight: 600;
}

.sidebar-tabs button > span {
  border-radius: 4px;
  background: var(--line);
  font-size: 9px;
  padding: 1px 5px;
  margin-left: 3px;
}

.chapter-list {
  padding: 22px 12px;
}

.eyebrow {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 1.5px;
  color: var(--subtle);
}

.contents-label {
  display: block;
  margin: 0 12px 12px;
}

.chapter-link {
  display: flex;
  width: 100%;
  text-align: left;
  gap: 12px;
  align-items: baseline;
  border-radius: 6px;
  padding: 13px 12px;
  font-size: 11px;
  line-height: 1.65;
  margin: 3px 0;
  color: var(--subtle);
}

.chapter-link:hover {
  background: var(--green-soft);
}

.chapter-link.current {
  color: var(--green);
  background: var(--green-soft);
  font-weight: 600;
}

.chapter-number {
  font-size: 10px;
  opacity: .8;
  font-variant-numeric: tabular-nums;
}

.current-dot {
  height: 5px;
  width: 5px;
  min-width: 5px;
  background: var(--green);
  border-radius: 50%;
  align-self: center;
  margin-left: auto;
}

.ornament {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #8b987c;
}

.ornament > span {
  width: 33px;
  height: 1px;
  background: var(--line);
}

.end-mark {
  justify-content: center;
  opacity: .6;
  margin-top: 25px;
}

.sidebar-bottom {
  margin-top: auto;
  padding: 20px 24px 24px;
  border-top: 1px solid var(--line);
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--subtle);
}

.progress-label strong {
  color: var(--green);
  font-weight: 500;
}

.progress-track {
  height: 4px;
  border-radius: 5px;
  background: var(--line);
  margin: 12px 0;
  overflow: hidden;
}

.progress-track span {
  display: block;
  height: 100%;
  background: #829475;
  border-radius: 5px;
  transition: width .2s;
}

.sidebar-bottom p {
  font-size: 10px;
  color: var(--subtle);
}

.sidebar-bottom em {
  display: block;
  font-family: Georgia, serif;
  font-size: 11px;
  margin-top: 8px;
}

.reader-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.reader-toolbar {
  height: 61px;
  min-height: 61px;
  border-bottom: 1px solid var(--line);
  padding: 0 27px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chapter-toolbar-label {
  font-size: 9px;
  letter-spacing: 1.3px;
  color: var(--subtle);
}

.toolbar-divider {
  width: 1px;
  height: 13px;
  background: var(--line);
  margin: 0 8px;
}

.reading-time {
  font-size: 10px;
  color: var(--subtle);
}

.ai-toggle {
  font-size: 11px;
  color: var(--green);
  padding: 7px;
  display: flex;
  gap: 6px;
  align-items: center;
  border-radius: 6px;
}

.ai-toggle:hover {
  background: var(--green-soft);
}

.reading-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
  scroll-padding: 24px;
}

.book-article {
  max-width: 735px;
  margin: auto;
  padding: 46px 52px 30px;
  outline: none;
}

.chapter-heading {
  margin-bottom: 24px;
}

.chapter-eyebrow {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--subtle);
  font-size: 8px;
  letter-spacing: 1.8px;
  font-weight: 500;
}

.chapter-eyebrow i {
  width: 14px;
  height: 1px;
  background: var(--subtle);
}

.chapter-overline {
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 15px;
  color: var(--green);
  margin: 31px 0 10px;
}

.chapter-heading h1 {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 400;
  font-size: clamp(32px, 3.15vw, 47px);
  line-height: 1.13;
  letter-spacing: -1.65px;
  max-width: 480px;
  text-wrap: balance;
}

.chapter-subtitle {
  font-size: 12px;
  line-height: 1.75;
  color: var(--subtle);
  margin-top: 17px;
  max-width: 380px;
}

.chapter-ornament {
  margin-top: 29px;
}

.prose-content {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--reading-size);
  line-height: var(--reading-leading);
  color: var(--ink);
}

.prose-content p {
  margin: 0 0 23px;
  overflow-wrap: anywhere;
}

.opening-paragraph::first-letter {
  font-size: 63px;
  float: left;
  margin: 8px 9px 0 0;
  line-height: .85;
  color: var(--green);
}

.prose-content mark {
  background: var(--highlight);
  color: var(--highlight-ink);
  padding: 3px 0;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  border-radius: 2px;
}

.prose-content p:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 8px;
  border-radius: 4px;
}

.passage-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 5px 7px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 3px 10px #26382b08;
  margin: -8px 0 27px;
  font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
}

.passage-actions button {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--subtle);
  padding: 7px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.passage-actions button:first-child {
  color: var(--green);
}

.passage-actions button:hover {
  background: var(--green-soft);
}

.passage-actions > i {
  width: 1px;
  height: 12px;
  background: var(--line);
  margin: 0 2px;
}

.chapter-end {
  justify-content: center;
  margin: 35px 0 25px;
}

.reading-hint {
  font-size: 10px;
  color: var(--subtle);
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  justify-content: center;
}

.reading-hint button {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.article-navigation {
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.reader-footer {
  min-height: 49px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 26px;
  font-size: 10px;
  color: var(--subtle);
  gap: 10px;
}

.reader-footer > span {
  display: flex;
  align-items: center;
  gap: 7px;
}

.reader-footer > div {
  display: flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}

.footer-of {
  color: var(--subtle);
  margin-left: 3px;
}

.footer-appearance {
  font-size: 10px;
}

.ai-panel {
  border-left: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  min-height: 0;
  outline: none;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 21px 17px 21px 21px;
  gap: 4px;
}

.ai-heading {
  display: flex;
  gap: 10px;
  align-items: center;
}

.sparkle-box {
  width: 33px;
  height: 33px;
  border: 1px solid var(--line);
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--green);
  background: var(--green-soft);
}

.ai-heading h2 {
  font-size: 12px;
  font-weight: 600;
}

.ai-heading p {
  font-size: 9px;
  color: var(--subtle);
  margin-top: 4px;
}

.ai-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--line);
  margin: 0 22px;
}

.ai-tabs > span {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 0 13px;
  border-bottom: 2px solid var(--green);
  font-size: 11px;
  color: var(--green);
}

.ai-tabs small {
  color: var(--subtle);
  font-size: 8px;
  letter-spacing: 1px;
  border: 1px solid var(--line);
  padding: 2px 5px;
  border-radius: 3px;
  margin-bottom: 8px;
}

.conversation {
  padding: 20px 22px;
  overflow: auto;
  flex: 1;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.context-card {
  padding: 13px;
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: 7px;
}

.context-card > div {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--subtle);
  font-size: 8px;
  letter-spacing: 1px;
}

.context-card i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #80966e;
  margin-left: auto;
}

.context-card strong {
  display: block;
  font-size: 10px;
  font-weight: 500;
  margin-top: 10px;
  line-height: 1.6;
}

.context-card p {
  font-size: 9px;
  color: var(--subtle);
  margin-top: 3px;
}

.conversation-divider {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 7px;
  letter-spacing: 1.3px;
  color: var(--subtle);
  margin: 26px 0 22px;
}

.conversation-divider span {
  flex: 1;
  height: 1px;
  background: var(--line);
}

.user-prompt {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.small-avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 50%;
  color: #6f6656;
  background: #eee8dd;
  font-size: 7px;
  margin-top: 2px;
}

.user-prompt p {
  font-size: 12px;
  line-height: 1.8;
  background: var(--panel);
  padding: 10px 13px;
  border-radius: 0 9px 9px 9px;
  overflow-wrap: anywhere;
}

.assistant-response {
  padding: 22px 0 0;
  font-size: 12px;
  line-height: 1.85;
}

.assistant-byline {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--green);
  margin-bottom: 13px;
}

.assistant-byline strong {
  font-size: 10px;
  font-weight: 600;
}

.assistant-byline > span {
  color: var(--subtle);
  font-size: 8px;
  margin-left: auto;
}

.assistant-response > p {
  margin: 11px 0;
  overflow-wrap: anywhere;
}

.assistant-response strong {
  font-weight: 600;
}

.assistant-response blockquote {
  margin: 17px 0;
  border-left: 2px solid #a7b49a;
  padding: 2px 0 2px 13px;
  color: var(--green);
  font-family: Georgia, serif;
  font-style: italic;
  font-size: 14px;
  line-height: 1.65;
}

.assistant-response blockquote button {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'Geist', sans-serif;
  font-style: normal;
  font-size: 9px;
  margin-top: 7px;
  color: var(--subtle);
}

.save-response {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  font-size: 9px;
  color: var(--subtle);
  border-radius: 5px;
  margin-top: 15px;
}

.save-response:hover {
  background: var(--green-soft);
}

.save-response > svg:last-child {
  margin-left: 12px;
}

.suggestions {
  margin-top: 28px;
}

.suggestions > span {
  display: block;
  font-size: 8px;
  letter-spacing: 1.2px;
  color: var(--subtle);
  margin-bottom: 10px;
}

.suggestions button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  margin-top: 7px;
  font-size: 10px;
  color: var(--subtle);
  gap: 8px;
}

.suggestions button:hover {
  background: var(--green-soft);
  color: var(--green);
}

.composer-area {
  padding: 13px 19px 14px;
  border-top: 1px solid var(--line);
}

.spoiler-note {
  font-size: 9px;
  color: var(--subtle);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  margin-bottom: 12px;
}

.composer {
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 12px;
  background: var(--paper);
}

.composer:focus-within {
  border-color: var(--green);
}

.composer textarea {
  resize: vertical;
  width: 100%;
  font-size: 11px;
  line-height: 1.7;
  background: transparent;
  outline-offset: 2px;
  min-height: 47px;
  max-height: 130px;
}

.composer textarea::placeholder {
  color: var(--subtle);
}

.composer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  margin-top: 6px;
}

.composer-bottom > span {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 8px;
  color: var(--subtle);
}

.composer-bottom button {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: var(--surface);
  background: var(--green);
}

.demo-disclaimer {
  text-align: center;
  font-size: 8px;
  color: var(--subtle);
  margin-top: 10px;
}

.added-message {
  margin-top: 26px;
}

.source-link {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--green);
  font-size: 10px;
}

.notes-list {
  padding: 16px 20px;
  overflow: auto;
}

.session-note {
  font-size: 11px;
  color: var(--subtle);
  line-height: 1.7;
  margin: 10px 0;
}

.saved-note {
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 12px;
  background: var(--surface);
  margin: 12px 0;
}

.note-location {
  font-size: 9px;
  color: var(--green);
  display: flex;
  gap: 5px;
  align-items: center;
}

.saved-note blockquote {
  font-family: Georgia, serif;
  font-size: 12px;
  border-left: 2px solid #b7bd9f;
  padding-left: 8px;
  margin: 10px 0;
  color: var(--subtle);
}

.saved-note p {
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.edit-note, .delete-note {
  font-size: 9px;
  margin-top: 10px;
  color: var(--subtle);
}

.reader-dialog {
  margin: auto;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 14px;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  overflow: auto;
  padding: 26px;
  box-shadow: 0 20px 90px #14221930;
}

.reader-dialog::backdrop {
  background: #17251c66;
  backdrop-filter: blur(3px);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dialog-header h2 {
  font-family: Georgia, serif;
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -.6px;
}

.dialog-description {
  color: var(--subtle);
  font-size: 12px;
  margin: 8px 0 20px;
  line-height: 1.7;
}

.note-quote {
  padding: 14px;
  border-left: 3px solid #acb698;
  background: var(--panel);
  font-family: Georgia, serif;
  font-size: 16px;
  line-height: 1.7;
  margin-bottom: 20px;
  max-height: 180px;
  overflow: auto;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin: 10px 0;
}

.note-input {
  display: block;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
  background: var(--paper);
  resize: vertical;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.primary-button, .secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 15px;
  border-radius: 6px;
  font-size: 12px;
}

.primary-button {
  background: var(--green);
  color: var(--surface);
}

.secondary-button {
  border: 1px solid var(--line);
}

.secondary-button:hover {
  background: var(--green-soft);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding: 15px 0;
  font-size: 13px;
}

.size-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.size-controls output {
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.theme-fieldset {
  margin-top: 24px;
}

.theme-fieldset legend {
  font-size: 13px;
  margin-bottom: 13px;
}

.theme-options {
  display: flex;
  gap: 12px;
}

.theme-options button {
  display: flex;
  flex: 1;
  gap: 7px;
  flex-direction: column;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 14px 10px;
  font-size: 11px;
  position: relative;
}

.theme-options button > span {
  font-family: Georgia, serif;
  font-size: 24px;
}

.theme-options button svg {
  position: absolute;
  top: 8px;
  right: 8px;
}

.theme-options button.chosen {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}

.swatch-paper {
  background: #f6f3e9;
  color: #384538;
}

.swatch-white {
  background: white;
  color: #384538;
}

.swatch-night {
  background: #253026;
  color: #e2e7d9;
}

.library-book {
  display: flex;
  align-items: center;
  text-align: left;
  width: 100%;
  gap: 17px;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 16px;
}

.library-book:hover {
  background: var(--green-soft);
}

.mini-cover {
  background: #425344;
  color: #e7e7ce;
  height: 88px;
  width: 62px;
  flex-shrink: 0;
  border-radius: 2px 5px 5px 2px;
  display: grid;
  place-items: center;
}

.library-book strong {
  display: block;
  font-size: 13px;
}

.library-book small {
  display: block;
  color: var(--subtle);
  font-size: 11px;
  margin-top: 5px;
}

.library-book > span > span {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 15px;
  color: var(--green);
  font-size: 11px;
}

.contents-toggle, .mobile-close {
  display: none;
}

.ai-hidden .workspace {
  grid-template-columns: 236px minmax(0, 1fr);
}

.is-focused .workspace {
  grid-template-columns: minmax(0, 1fr);
}

.is-focused .library-panel, .is-focused .ai-panel {
  display: none;
}

.is-focused .book-article {
  max-width: 790px;
}

.is-focused .reader-toolbar, .is-focused .reader-footer {
  padding-inline: max(24px, calc((100vw - 685px) / 2));
}

@media (min-width: 1600px) {
  .workspace {
    grid-template-columns: 260px minmax(0, 1fr) 370px;
  }

  .book-article {
    padding-top: 65px;
  }

  .ai-hidden .workspace {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .is-focused .workspace {
    grid-template-columns: 1fr;
  }

  .conversation {
    padding: 24px 26px;
  }

}

@media (max-width: 1199px) {
  .workspace {
    grid-template-columns: 205px minmax(0, 1fr) 300px;
  }

  .brand {
    min-width: 147px;
  }

  .book-article {
    padding: 36px 30px 25px;
  }

  .reader-toolbar {
    padding: 0 16px;
  }

  .reading-time, .toolbar-group:first-child > .toolbar-divider {
    display: none;
  }

  .ai-toggle span {
    display: none;
  }

  .ai-panel-header {
    padding: 19px 13px;
  }

  .conversation {
    padding: 18px;
  }

  .ai-heading p {
    font-size: 8px;
  }

  .chapter-link {
    font-size: 10px;
    gap: 8px;
  }

  .reader-footer {
    padding: 0 16px;
  }

  .reader-footer > span {
    display: none;
  }

  .sidebar-tabs {
    gap: 17px;
  }

  .ai-hidden .workspace {
    grid-template-columns: 205px minmax(0, 1fr);
  }

  .is-focused .workspace {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 1023px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr) 310px;
  }

  .ai-hidden .workspace {
    grid-template-columns: 1fr;
  }

  .library-panel {
    display: none;
  }

  .library-panel.mobile-open {
    display: flex;
    grid-column: 1 / -1;
    max-height: 430px;
    border-bottom: 1px solid var(--line);
    border-right: 0;
  }

  .workspace:has(.mobile-open) {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .mobile-open .book-summary, .mobile-open .sidebar-bottom, .mobile-open .end-mark, .desktop-book-icon {
    display: none;
  }

  .mobile-open .chapter-list {
    padding: 14px;
  }

  .mobile-open .chapter-link {
    padding: 9px 12px;
    font-size: 12px;
  }

  .contents-toggle, .mobile-close {
    display: inline-flex;
  }

  .brand {
    min-width: auto;
    margin-right: 15px;
  }

  .header-breadcrumb {
    font-size: 11px;
  }

  .header-breadcrumb > span, .header-breadcrumb small {
    display: none;
  }

  .book-article {
    padding: 34px 35px 25px;
  }

  .is-focused .workspace {
    grid-template-columns: 1fr;
  }

  .chapter-heading h1 {
    font-size: 38px;
  }

  .is-focused .library-panel, .is-focused .contents-toggle {
    display: none;
  }

}

@media (max-width: 767px) {
  .app-header {
    height: 60px;
    padding: 0 17px;
    gap: 12px;
  }

  .brand {
    font-size: 26px;
    margin: 0;
  }

  .brand svg {
    margin-right: 8px;
  }

  .header-breadcrumb {
    display: none;
  }

  .header-actions {
    gap: 14px;
  }

  .demo-badge {
    font-size: 9px;
  }

  .workspace, .ai-hidden .workspace, .is-focused .workspace {
    display: flex;
    flex-direction: column;
    height: auto;
    min-height: calc(100dvh - 60px);
  }

  .reader-main {
    min-height: calc(100dvh - 60px);
  }

  .reader-toolbar {
    min-height: 58px;
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--paper);
    padding: 0 13px;
  }

  .icon-button {
    width: 40px;
    height: 44px;
  }

  .toolbar-group {
    gap: 1px;
  }

  .toolbar-divider {
    margin: 0 5px;
  }

  .ai-toggle {
    min-height: 44px;
    padding: 8px;
  }

  .reading-scroll {
    overflow: visible;
  }

  .book-article {
    padding: 35px 24px 25px;
  }

  .chapter-heading h1 {
    font-size: 40px;
    max-width: 380px;
  }

  .chapter-overline {
    margin-top: 28px;
  }

  .chapter-subtitle {
    font-size: 13px;
  }

  .chapter-eyebrow {
    font-size: 8px;
    letter-spacing: 1.3px;
  }

  .passage-actions {
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px 5px;
    max-width: 100%;
  }

  .passage-actions button {
    min-height: 44px;
    font-size: 10px;
    padding: 5px;
  }

  .reader-footer {
    padding: 0 20px;
  }

  .reader-footer > span {
    display: flex;
    font-size: 9px;
  }

  .footer-appearance {
    display: none;
  }

  .ai-panel {
    min-height: 650px;
    height: 850px;
    max-height: 100dvh;
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .ai-panel-header {
    padding: 20px 24px;
  }

  .ai-heading h2 {
    font-size: 14px;
  }

  .ai-heading p {
    font-size: 11px;
  }

  .ai-tabs > span {
    font-size: 12px;
  }

  .conversation {
    padding: 22px 24px;
  }

  .context-card strong {
    font-size: 12px;
  }

  .context-card p, .context-card > div {
    font-size: 10px;
  }

  .assistant-response, .user-prompt p {
    font-size: 14px;
  }

  .assistant-byline strong {
    font-size: 12px;
  }

  .assistant-byline > span {
    font-size: 10px;
  }

  .suggestions button {
    min-height: 44px;
    font-size: 12px;
  }

  .save-response {
    min-height: 44px;
    font-size: 11px;
  }

  .composer-area {
    padding: 17px 24px;
  }

  .composer textarea {
    font-size: 16px;
  }

  .composer-bottom > span, .demo-disclaimer {
    font-size: 10px;
  }

  .composer-bottom button {
    width: 40px;
    height: 40px;
  }

  .note-input {
    font-size: 16px;
  }

  .library-panel.mobile-open {
    max-height: 480px;
  }

  .chapter-link, .sidebar-tabs button {
    min-height: 44px;
  }

  .is-focused .reader-toolbar, .is-focused .reader-footer {
    padding: 0 14px;
  }

  .article-navigation .text-button {
    min-height: 44px;
    font-size: 11px;
  }

  .dialog-header h2 {
    font-size: 22px;
  }

}

@media (max-width: 359px) {
  .focus-toggle {
    display: none;
  }

  .chapter-heading h1 {
    font-size: 35px;
  }

  .book-article {
    padding-inline: 18px;
  }

  .passage-actions > i {
    display: none;
  }

}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    scroll-behavior: auto !important;
  }

}
</style>
