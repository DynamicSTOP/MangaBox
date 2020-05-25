<script>
import Manga from '@/components/MangaList/Manga'
import { mapState } from 'vuex'
export default {
  name: 'MangaList',
  components: { Manga },
  computed: {
    ...mapState(['allManga']),
    sortedManga () {
      const s = this.allManga.slice(0).sort((a, b) => {
        const aNew = a.json.newChapters.indexOf('en') !== -1
        const bNew = b.json.newChapters.indexOf('en') !== -1
        if (aNew && !bNew) {
          return -1
        } else if (!aNew && bNew) {
          return 1
        } else {
          const al = a.json.newChapters.length > 0
          const bl = b.json.newChapters.length > 0
          if (al && !bl) {
            return -1
          } else if (!al && bl) {
            return 1
          }
        }
        return a.id - b.id
      })
      console.log(s.map(m => {
        return {
          id: m.id,
          nc: JSON.stringify(m.json.newChapters)
        }
      }))
      return s
    }
  }
}
</script>

<template>
  <div class="mangaList flex-row">
    <div v-if="sortedManga.length === 0">
      Nothing tracked
    </div>
    <manga
      v-for="manga in sortedManga"
      :key="'manga_'+manga.id"
      :manga="manga"
    />
  </div>
</template>
