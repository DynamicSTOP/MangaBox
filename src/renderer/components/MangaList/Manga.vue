<script>
export default {
  name: 'Manga',
  props: {
    manga: {
      type: Object,
      required: true
    }
  },
  computed: {
    isOld () {
      return !this.manga.json.newChapters || this.manga.json.newChapters.length === 0
    },
    newChapters () {
      const chapters = this.manga.json.newChapters || []
      return chapters.filter(c => ['ru', 'en'].indexOf(c) !== -1).sort().map(c => c[0].toUpperCase() + c.slice(1))
    }
  },
  methods: {
    openManga (event) {
      if (event.ctrlKey) {
        if (confirm('Mark old?')) {
          this.$store.dispatch('MANGA_SET_VIEWED', { id: this.manga.id })
        }
      } else {
        this.$store.dispatch('MANGA_OPEN', { id: this.manga.id })
      }
    }
  }
}
</script>
<template>
  <div
    class="manga"
    :title="manga.title"
    @click.stop="openManga"
  >
    <img
      v-if="manga.json.image"
      class="title"
      :src="manga.json.image"
      :class="{old: isOld}"
    >
    <div
      class="manga-bottom flex-row"
    >
      <div
        v-show="newChapters.length > 0"
        class="manga-chapters"
      >
        {{ newChapters.join(', ') }}
      </div>
    </div>
  </div>
</template>
