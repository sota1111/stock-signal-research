import { useContext } from 'react'
import { FilterContext } from './filterContextValue'

export const useFilters = () => useContext(FilterContext)
