<script>
import MangaList from '@/components/MangaList'
import TopBar from '@/components/TopBar'
import { mapGetters } from 'vuex'
export default {
  name: 'Home',
  components: {
    TopBar,
    MangaList
  },
  computed: {
    ...mapGetters(['isSiteViewOpen'])
  }
}
</script>

<template>
  <div>
    <top-bar />
    <div v-show="!isSiteViewOpen">
      <manga-list />
    </div>
  </div>
</template>
