// Данные PoE2 (порт данных Exiled Exchange 2): загрузка en/ru, поиск предметов и статов.
// Язык текста предмета определяется так же, как у PoE1 (`Item Class:` / `Класс предмета:`) — detectItemLang.
export * from './interfaces'
export { Poe2Data, type Poe2ItemNamespace, type Poe2DataParts } from './Poe2Data'
export {
  createPoe2DataStore,
  getDefaultPoe2DataStore,
  loadPoe2Data,
  isPoe2Lang,
  revivePoe2ClientStrings,
  POE2_DATA_BASE_URL,
  type Poe2DataStore,
  type Poe2DataStoreOptions
} from './store'
export { detectItemLang } from '../../poe1/data/lang'
