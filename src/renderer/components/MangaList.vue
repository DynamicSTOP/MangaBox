<script>
import { mapState } from 'vuex'
export default {
  name: 'MangaList',
  computed: {
    ...mapState(['allManga'])
  }
}
</script>

<template>
  <div class="MangaList">
    <div v-if="allManga.length === 0">
      Nothing tracked
    </div>
    <div
      v-for="manga in allManga"
      :key="'manga_'+manga.id"
    >
      <img
        v-if="manga.json.image"
        :src="manga.json.image"
      >
    </div>
  </div>
</template>
