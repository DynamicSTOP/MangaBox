<script>
import Manga from '@/components/MangaList/Manga'
import { mapState } from 'vuex'
export default {
  name: 'MangaList',
  components: { Manga },
  computed: {
    ...mapState(['allManga'])
  }
}
</script>

<template>
  <div class="mangaList flex-row">
    <div v-if="allManga.length === 0">
      Nothing tracked
    </div>
    <manga
      v-for="manga in allManga"
      :key="'manga_'+manga.id"
      :manga="manga"
    />
  </div>
</template>
