<script>
import MangaList from '@/components/MangaList'
import TopBar from '@/components/TopBar'

export default {
  name: 'Home',
  components: {
    TopBar,
    MangaList
  }
}
</script>

<template>
  <div>
    <top-bar />
    <manga-list />
  </div>
</template>
