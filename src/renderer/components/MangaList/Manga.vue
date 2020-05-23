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
    },
    toggleSave () {
      if (this.manga.save) return
      if (confirm(`Save ${this.manga.title} ?`)) {
        this.$store.dispatch('MANGA_TOGGLE_SAVE', {
          id: this.manga.id,
          save: true
        })
      }
    }
  }
}
</script>
<template>
  <div
    class="manga"
    :title="manga.title"
    :class="{old: isOld}"
    @click.stop="openManga"
  >
    <img
      v-if="manga.json.image"
      class="title"
      :src="manga.json.image"
    >
    <div
      class="manga-top flex-row"
    >
      <div
        class="manga-save"
        :class="{saved:manga.save}"
        @click.stop="toggleSave"
      >
        S
      </div>
    </div>
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
