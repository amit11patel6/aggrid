# aggrid

 private void applySorting(CriteriaBuilder cb, CriteriaQuery<?> criteriaQuery, Root<Employee> root, List<ServerSideGetRowsRequest.SortModel> sortModel, boolean isGroupingQuery, List<ServerSideGetRowsRequest.ColumnVO> rowGroupCols, List<Selection<?>> selections) {
        List<Order> orders = new ArrayList<>();

        if (!CollectionUtils.isEmpty(sortModel)) {
            for (ServerSideGetRowsRequest.SortModel sm : sortModel) {
                String field = sm.getColId(); // Column ID is usually the field name
                String sortDirection = sm.getSort(); // "asc" or "desc"
                Expression<?> sortExpression = null;

                if (isGroupingQuery) {
                    // When grouping, we can only sort by:
                    // 1. The group column(s) currently being selected/grouped by.
                    // 2. Aggregated values included in the select clause.

                    boolean isGroupCol = false;
                    if (rowGroupCols != null) {
                        // Check if the sort column is one of the configured group columns
                        // We can sort by group columns up to the *next* grouping level being fetched.
                         int currentGroupingLevel = CollectionUtils.isEmpty(request.getGroupKeys()) ? 0 : request.getGroupKeys().size();
                         for (int i = 0; i <= currentGroupingLevel && i < rowGroupCols.size(); i++) {
                             ServerSideGetRowsRequest.ColumnVO groupCol = rowGroupCols.get(i);
                             if (groupCol.getField().equals(field)) {
                                 isGroupCol = true;
                                 // When sorting by a group column in a grouped query,
                                 // the expression should be the path from the root.
                                 sortExpression = root.get(field);
                                 break;
                             }
                         }
                    }

                    if (sortExpression == null) {
                        // If not a group column being grouped by, check if it's an aggregated column by alias
                         // Need to find the corresponding Expression from the selections list
                         if (selections != null) {
                              Optional<? extends Selection<?>> aggSelection = selections.stream()
                                  .filter(s -> field.equals(s.getAlias())) // Assuming sort colId matches aggregation alias
                                  .findFirst();
                              if (aggSelection.isPresent()) {
                                   sortExpression = (Expression<?>) aggSelection.get(); // Cast Selection to Expression
                              }
                         }

                         if (sortExpression == null) {
                             logger.warn("Sorting by non-group/non-aggregated column '{}' ignored in grouping query.", field);
                              continue; // Skip this sort model
                         }
                    }

                } else {
                    // Normal data query (or leaf data under group), sort by any column field
                    sortExpression = root.get(field);
                }

                if (sortExpression != null) {
                     if ("desc".equalsIgnoreCase(sortDirection)) {
                        orders.add(cb.desc(sortExpression));
                     } else {
                        orders.add(cb.asc(sortExpression));
                     }
                }
            }
        }
