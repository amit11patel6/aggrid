package com.example.aggridssremployee.service;

import com.example.aggridssremployee.dto.ServerSideGetRowsRequest;
import com.example.aggridssremployee.dto.ServerSideGetRowsResponse;
import com.example.aggridssremployee.model.Employee;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.*; // Use jakarta.persistence.criteria.* for Spring Boot 3+
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class EmployeeService {

    private static final Logger logger = LoggerFactory.getLogger(EmployeeService.class);

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional(readOnly = true) // Use read-only transactions for fetching data
    public ServerSideGetRowsResponse getData(ServerSideGetRowsRequest request) {
        logger.info("Received AG Grid SSRM request: startRow={}, endRow={}, groupKeys={}, filterModel={}, sortModel={}",
                request.getStartRow(), request.getEndRow(), request.getGroupKeys(), request.getFilterModel(), request.getSortModel());

        CriteriaBuilder cb = entityManager.getCriteriaBuilder();

        // --- Determine the nature of the request (Grouping vs. Data) ---
        boolean isGroupingRequest = !CollectionUtils.isEmpty(request.getRowGroupCols());
        boolean isRequestForSpecificGroupData = isGroupingRequest && !CollectionUtils.isEmpty(request.getGroupKeys());
        // The current grouping level we are requesting data for
        int currentGroupingLevel = isRequestForSpecificGroupData ? request.getGroupKeys().size() : 0;
        // The total number of grouping levels configured by the frontend
        int maxGroupingLevel = isGroupingRequest ? request.getRowGroupCols().size() : 0;
        // Are we requesting the actual employee rows under the deepest group?
        boolean isRequestForLeafDataUnderGroup = isGroupingRequest && currentGroupingLevel == maxGroupingLevel;


        // --- Build the base query for data fetching ---
        CriteriaQuery<Object[]> dataQuery = cb.createQuery(Object[].class); // Use Object[] to hold diverse types (group values, aggregations, entity fields)
        Root<Employee> root = dataQuery.from(Employee.class);

        // --- Build WHERE clause (Filters + Group Key Filters) ---
        // We need the Root to build predicates, so build them after creating the Root.
        List<Predicate> predicates = buildWherePredicates(cb, root, request);
        if (!predicates.isEmpty()) {
            dataQuery.where(cb.and(predicates.toArray(new Predicate[0])));
        }

        // --- Configure SELECT, GROUP BY, and potential Aggregations ---
        List<Selection<?>> selections = new ArrayList<>();
        List<Expression<?>> groupByExpressions = new ArrayList<>();

        if (isGroupingRequest && !isRequestForLeafDataUnderGroup) {
            // --- This is a request for a GROUP LEVEL ---
            // Select the group column value for the current level
            String groupField = request.getRowGroupCols().get(currentGroupingLevel).getField();
            Path<?> groupPath = root.get(groupField);
            selections.add(groupPath.alias(groupField)); // Select the group value, use field name as alias

            // Add aggregation (e.g., count) for the group level. AG Grid often needs counts.
            selections.add(cb.count(root).alias("agGrid_Count")); // Count items in this group

            // TODO: Add other aggregations based on request.getValueCols() if needed (e.g., SUM, AVG of salary)
            // Example: selections.add(cb.sum(root.get("salary")).alias("sum_salary"));

            dataQuery.multiselect(selections); // Use multiselect for grouping results

            // Group by the selected group column
            groupByExpressions.add(groupPath);
            dataQuery.groupBy(groupByExpressions);

             // AG Grid often sorts grouped rows by the group column itself by default, or by specified sort models.
             // Apply sorting based on request.sortModel, specifically handling group columns.
            applySorting(cb, dataQuery, root, request.getSortModel(), true, request.getRowGroupCols(), selections);

        } else {
            // --- This is a request for LEAF LEVEL DATA (either no grouping or under the last group) ---
            // Select specific fields of the Employee entity
            // Ensure the order here matches the order used when formatting results in formatResults()
            selections.add(root.get("id").alias("id"));
            selections.add(root.get("name").alias("name"));
            selections.add(root.get("department").alias("department"));
            selections.add(root.get("jobTitle").alias("jobTitle"));
            selections.add(root.get("salary").alias("salary"));
            selections.add(root.get("hireDate").alias("hireDate"));
            // Add other employee fields here

            dataQuery.multiselect(selections);

            // Apply sorting based on request.sortModel for leaf data
            applySorting(cb, dataQuery, root, request.getSortModel(), false, null, null);
        }

        // --- Execute Data Query with Pagination ---
        TypedQuery<Object[]> typedDataQuery = entityManager.createQuery(dataQuery);
        typedDataQuery.setFirstResult(request.getStartRow());
        // Calculate page size: AG Grid sends endRow, we need count = endRow - startRow
        int pageSize = request.getEndRow() - request.getStartRow();
        if (pageSize <= 0) pageSize = 100; // Prevent infinite loop or error if start/end are same or invalid
        typedDataQuery.setMaxResults(pageSize);

        List<Object[]> results = typedDataQuery.getResultList();
        logger.debug("Fetched {} rows from DB for range {}-{}", results.size(), request.getStartRow(), request.getEndRow());


        // --- Build and Execute COUNT Query to determine lastRow ---
        // This query needs to apply the SAME predicates as the data query
        long totalRowCount = getTotalRowCount(cb, request, predicates);
        logger.debug("Total row count for the current level/filters: {}", totalRowCount);


        // --- Format Results for AG Grid Response ---
        List<Map<String, Object>> rowsThisPage = formatResults(results, request, isGroupingRequest, isRequestForLeafDataUnderGroup, currentGroupingLevel, selections);

        // Determine the lastRow value for AG Grid
        // If the number of results + startRow is less than the total count,
        // there are more rows after this page. Otherwise, this is the last page.
        // AG Grid expects lastRow to be the total count matching the criteria.
        int lastRow = (int) totalRowCount;
        // If we fetched less than the requested page size, it means we hit the end.
        // AG Grid can figure this out based on `lastRow`. If results.size() < pageSize and lastRow > 0,
        // AG Grid knows the total is `lastRow` and it has fetched up to that point.
        // If results.size() < pageSize AND (startRow + results.size() == totalRowCount),
        // this block contains the last row.
        // A simple approach is just to return the totalRowCount.

        // AG Grid v22 SSRM handles the scrollbar based on lastRow. If lastRow = total, it works.
        // If unsure or for very large sets, returning -1 for infinite scroll is an option,
        // but providing the count is generally better for scrollbar accuracy.


        logger.info("Responding with {} rows, lastRow={}", rowsThisPage.size(), lastRow);
        return new ServerSideGetRowsResponse(rowsThisPage, lastRow);
    }

    /**
     * Helper method to build WHERE predicates from the request filters and group keys.
     * @param cb CriteriaBuilder instance.
     * @param root The Root of the entity (Employee).
     * @param request The SSRM request DTO.
     * @return A list of JPA Predicate objects.
     */
    private List<Predicate> buildWherePredicates(CriteriaBuilder cb, Root<Employee> root, ServerSideGetRowsRequest request) {
        List<Predicate> predicates = new ArrayList<>();

        // 1. Group Key Filters (if fetching data inside a specific group)
        boolean isGroupingRequest = !CollectionUtils.isEmpty(request.getRowGroupCols());
        if (isGroupingRequest && !CollectionUtils.isEmpty(request.getGroupKeys())) {
            List<String> groupKeys = request.getGroupKeys();
            List<ServerSideGetRowsRequest.ColumnVO> rowGroupCols = request.getRowGroupCols();

            // Add predicates for each group key provided in the request
            for (int i = 0; i < groupKeys.size(); i++) {
                if (i < rowGroupCols.size()) { // Ensure groupKey index is within rowGroupCols bounds
                    String groupColField = rowGroupCols.get(i).getField();
                    String groupKeyValue = groupKeys.get(i);
                    Path<?> groupPath = root.get(groupColField);

                    if (groupKeyValue == null) {
                         predicates.add(cb.isNull(groupPath));
                    } else {
                         // Need to handle potential type conversions if group field is not String
                        if (groupPath.getJavaType().equals(String.class)) {
                             predicates.add(cb.equal(groupPath, groupKeyValue));
                        } else if (groupPath.getJavaType().equals(Integer.class)) {
                             try {
                                 Integer intValue = Integer.parseInt(groupKeyValue);
                                 predicates.add(cb.equal(groupPath, intValue));
                             } catch (NumberFormatException e) {
                                  logger.warn("Invalid integer group key for field {}: {}", groupColField, groupKeyValue);
                                 // Add a predicate that returns no results if the key is invalid
                                 predicates.add(cb.disjunction()); // OR of empty set is false
                             }
                        } else {
                             // Add more type handling here as needed (Date, etc.)
                             // For simplicity, defaulting to String comparison might work for some DBs, but is risky.
                            logger.warn("Unsupported group key type for field {}: {}", groupColField, groupPath.getJavaType().getSimpleName());
                             // Add a predicate that returns no results
                             predicates.add(cb.disjunction());
                        }
                    }
                }
            }
        }

        // 2. Column Filters (Global Filters applied to all data)
        if (request.getFilterModel() != null && !request.getFilterModel().isEmpty()) {
            request.getFilterModel().forEach((field, filterModel) -> {
                // TODO: Implement support for compound filters (AND/OR conditions) within a single column filter
                // This requires checking filterModel.operator, filterModel.condition1, condition2 etc.

                // Basic single filter condition implementation
                String filterType = filterModel.getFilterType();
                String conditionType = filterModel.getType();
                String filterValue = filterModel.getFilter();

                logger.debug("Applying filter: field={}, type={}, condition={}, value={}", field, filterType, conditionType, filterValue);

                Path<?> filterPath = root.get(field); // Get the path for the field

                // --- Handle different filter types ---
                if ("text".equals(filterType) && StringUtils.hasText(filterValue)) {
                    // Assume text columns are String
                    if (!filterPath.getJavaType().equals(String.class)) {
                        logger.warn("Attempted text filter on non-String column: {}", field);
                        return; // Skip this filter
                    }
                    Path<String> textPath = root.get(field);
                    String lowerFilterValue = filterValue.toLowerCase();

                    switch (conditionType) {
                        case "contains":
                            predicates.add(cb.like(cb.lower(textPath), "%" + lowerFilterValue + "%"));
                            break;
                        case "notContains":
                            predicates.add(cb.notLike(cb.lower(textPath), "%" + lowerFilterValue + "%"));
                            break;
                        case "equals":
                            predicates.add(cb.equal(cb.lower(textPath), lowerFilterValue));
                            break;
                        case "notEqual":
                            predicates.add(cb.notEqual(cb.lower(textPath), lowerFilterValue));
                            break;
                        case "startsWith":
                             predicates.add(cb.like(cb.lower(textPath), lowerFilterValue + "%"));
                             break;
                        case "endsWith":
                             predicates.add(cb.like(cb.lower(textPath), "%" + lowerFilterValue));
                             break;
                        case "blank":
                             predicates.add(cb.or(cb.isNull(textPath), cb.equal(textPath, "")));
                             break;
                        case "notBlank":
                             predicates.add(cb.and(cb.isNotNull(textPath), cb.notEqual(textPath, "")));
                             break;
                        default:
                            logger.warn("Unsupported text filter condition type: {}", conditionType);
                    }
                } else if ("number".equals(filterType) && StringUtils.hasText(filterValue)) {
                     // Assume number columns are Integer or similar numeric types
                     if (!Number.class.isAssignableFrom(filterPath.getJavaType()) && !filterPath.getJavaType().equals(Integer.class)) { // Basic check
                          logger.warn("Attempted number filter on non-numeric column: {}", field);
                          return; // Skip this filter
                     }
                    try {
                         Number filterNumValue = null;
                         Number filterToNumValue = null;
                         // Basic type conversion - refine as needed for Float, Double, BigDecimal
                         if (filterPath.getJavaType().equals(Integer.class)) {
                             filterNumValue = Integer.parseInt(filterValue);
                             if (filterModel.getFilterTo() != null) filterToNumValue = filterModel.getFilterTo();
                         } // Add other number types here

                         if (filterNumValue == null && !conditionType.equals("blank") && !conditionType.equals("notBlank")) {
                             logger.warn("Invalid number format for filter value: {} on field {}", filterValue, field);
                             return; // Skip filter if value is invalid
                         }

                         Path<Number> numberPath = root.get(field); // Cast path

                         switch (conditionType) {
                             case "equals":
                                 predicates.add(cb.equal(numberPath, filterNumValue));
                                 break;
                             case "notEqual":
                                 predicates.add(cb.notEqual(numberPath, filterNumValue));
                                 break;
                             case "lessThan":
                                  predicates.add(cb.lessThan(numberPath, filterNumValue));
                                  break;
                             case "lessThanOrEqual":
                                  predicates.add(cb.lessThanOrEqualTo(numberPath, filterNumValue));
                                  break;
                             case "greaterThan":
                                  predicates.add(cb.greaterThan(numberPath, filterNumValue));
                                  break;
                             case "greaterThanOrEqual":
                                   predicates.add(cb.greaterThanOrEqualTo(numberPath, filterNumValue));
                                   break;
                             case "inRange": // Requires filterTo
                                  if (filterNumValue != null && filterToNumValue != null) {
                                        predicates.add(cb.between(numberPath, filterNumValue, filterToNumValue));
                                  } else {
                                      logger.warn("Number 'inRange' filter requires both 'filter' and 'filterTo' values on field {}", field);
                                  }
                                  break;
                             case "blank":
                                  predicates.add(cb.isNull(numberPath)); // Numbers typically can't be ""
                                  break;
                             case "notBlank":
                                  predicates.add(cb.isNotNull(numberPath));
                                  break;
                             default:
                                 logger.warn("Unsupported number filter condition type: {}", conditionType);
                         }
                    } catch(NumberFormatException e) {
                        logger.warn("Invalid number format for filter: '{}' on field '{}'", filterValue, field, e);
                         // If the filter value is invalid, treat this filter as matching nothing
                         predicates.add(cb.disjunction());
                    }
                } else if ("date".equals(filterType) && StringUtils.hasText(filterValue)) {
                    // Assuming date columns are LocalDate or similar
                     if (!filterPath.getJavaType().equals(LocalDate.class)) {
                          logger.warn("Attempted date filter on non-LocalDate column: {}", field);
                          return; // Skip this filter
                     }
                    try {
                         // AG Grid date filter sends dates in 'YYYY-MM-DD' format by default
                         LocalDate filterDate = LocalDate.parse(filterValue);
                         Path<LocalDate> datePath = root.get(field);

                         switch (conditionType) {
                             case "equals":
                                 predicates.add(cb.equal(datePath, filterDate));
                                 break;
                              case "notEqual":
                                 predicates.add(cb.notEqual(datePath, filterDate));
                                 break;
                             case "lessThan":
                                  predicates.add(cb.lessThan(datePath, filterDate));
                                  break;
                             case "lessThanOrEqual":
                                  predicates.add(cb.lessThanOrEqualTo(datePath, filterDate));
                                  break;
                             case "greaterThan":
                                  predicates.add(cb.greaterThan(datePath, filterDate));
                                  break;
                             case "greaterThanOrEqual":
                                   predicates.add(cb.greaterThanOrEqualTo(datePath, filterDate));
                                   break;
                              // Add 'inRange' for dates similarly using filterTo (requires parsing filterTo as well)
                              case "blank":
                                  predicates.add(cb.isNull(datePath));
                                  break;
                              case "notBlank":
                                  predicates.add(cb.isNotNull(datePath));
                                  break;
                             default:
                                 logger.warn("Unsupported date filter condition type: {}", conditionType);
                         }
                    } catch (DateTimeParseException e) {
                         logger.warn("Invalid date format for filter: '{}' on field '{}'", filterValue, field, e);
                         predicates.add(cb.disjunction()); // Treat invalid date filter as matching nothing
                    }
                } else if ("set".equals(filterType) && !CollectionUtils.isEmpty(filterModel.getValues())) {
                     // Assuming set filter values match the column type (e.g., String, Integer)
                      List<String> filterValues = filterModel.getValues();
                      List<Object> castValues = new ArrayList<>(); // Values cast to the target type

                     try {
                        // Attempt to cast filter values to the column's Java type
                        if (filterPath.getJavaType().equals(String.class)) {
                            castValues.addAll(filterValues); // No cast needed
                        } else if (filterPath.getJavaType().equals(Integer.class)) {
                             for (String val : filterValues) {
                                 castValues.add(Integer.parseInt(val));
                             }
                        } // Add other types as needed for set filters
                        else {
                             logger.warn("Unsupported column type for set filter: {}", filterPath.getJavaType().getSimpleName());
                             return; // Skip filter
                        }

                        if (!castValues.isEmpty()) {
                             predicates.add(filterPath.in(castValues));
                        }
                     } catch (NumberFormatException e) {
                         logger.warn("Invalid value in set filter list for field '{}'", field, e);
                         predicates.add(cb.disjunction()); // Treat invalid values as matching nothing
                     }

                }
                 // TODO: Add handlers for other filter types like boolean filters
            });
        }
        return predicates;
    }


    /**
     * Helper method to get the total row count for the current level/filters.
     * This determines the `lastRow` for the AG Grid response.
     * @param cb CriteriaBuilder instance.
     * @param request The SSRM request DTO.
     * @param predicates The list of Predicates (WHERE clauses) to apply.
     * @return The total count.
     */
    private long getTotalRowCount(CriteriaBuilder cb, ServerSideGetRowsRequest request, List<Predicate> predicates) {
         boolean isGroupingRequest = !CollectionUtils.isEmpty(request.getRowGroupCols());
         boolean isRequestForSpecificGroupData = isGroupingRequest && !CollectionUtils.isEmpty(request.getGroupKeys());
         int currentGroupingLevel = isRequestForSpecificGroupData ? request.getGroupKeys().size() : 0;
         int maxGroupingLevel = isGroupingRequest ? request.getRowGroupCols().size() : 0;
         boolean isRequestForLeafDataUnderGroup = isGroupingRequest && currentGroupingLevel == maxGroupingLevel;


        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<Employee> root = countQuery.from(Employee.class);

         // Apply the same predicates calculated for the data query
        if (!predicates.isEmpty()) {
            // Note: If predicates depended on specific joins/paths only present in the dataQuery's root/joins,
            // you'd need to recreate those joins here on the countQuery's root before applying predicates.
            // In this simple example, predicates only use direct paths from the Employee root, so reuse is fine.
            countQuery.where(cb.and(predicates.toArray(new Predicate[0])));
        }

        if (isGroupingRequest && !isRequestForLeafDataUnderGroup) {
            // For a group level request, count the number of *distinct groups* at this level
            String groupField = request.getRowGroupCols().get(currentGroupingLevel).getField();
            countQuery.select(cb.countDistinct(root.get(groupField)));
             logger.debug("Executing COUNT DISTINCT query for group level {}: {}", currentGroupingLevel, countQuery);

        } else {
            // For leaf level data (no grouping or under the last group), count the total number of rows
            countQuery.select(cb.count(root));
             logger.debug("Executing COUNT query for leaf level: {}", countQuery);
        }

        try {
             return entityManager.createQuery(countQuery).getSingleResult();
        } catch (Exception e) {
            logger.error("Error executing count query", e);
            // Return 0 or -1 in case of error, depending on desired grid behavior
            return 0;
        }
    }

    /**
     * Helper method to apply sorting to the CriteriaQuery.
     * Handles sorting for both group level and leaf level queries.
     * @param cb CriteriaBuilder instance.
     * @param criteriaQuery The CriteriaQuery to apply sorting to.
     * @param root The Root of the entity.
     * @param sortModel The list of SortModel from the request.
     * @param isGroupingQuery True if the query is for a group level, false for leaf data.
     * @param rowGroupCols List of grouping columns (needed for group query sorting).
     * @param selections List of selections for the query (needed to potentially find aggregated columns for sorting).
     */
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
                        for (ServerSideGetRowsRequest.ColumnVO groupCol : rowGroupCols) {
                            if (groupCol.getField().equals(field)) {
                                isGroupCol = true;
                                // Find the corresponding selection for the group column by its alias
                                sortExpression = selections.stream()
                                    .filter(s -> field.equals(s.getAlias()))
                                    .findFirst()
                                    .orElse(null); // Should not be null if it's a selected group col
                                break;
                            }
                        }
                    }

                    if (sortExpression == null) {
                        // If not a group column, check if it's an aggregated column by alias
                         // Example: Check for 'agGrid_Count' or 'sum_salary' aliases added in the select
                         sortExpression = selections.stream()
                             .filter(s -> field.equals(s.getAlias())) // Assuming sort colId matches aggregation alias
                             .findFirst()
                             .orElse(null);
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

        // AG Grid often expects results for a group level to be ordered by the group column itself
        // as the primary sort, even if other sorts are applied.
        // If no sort model is provided but it's a group query, sort by the group column.
         if (orders.isEmpty() && isGroupingQuery && !CollectionUtils.isEmpty(rowGroupCols) && rowGroupCols.size() > request.getGroupKeys().size()) {
             String groupField = rowGroupCols.get(request.getGroupKeys().size()).getField();
             orders.add(cb.asc(root.get(groupField))); // Default sort ascending by group field
              logger.debug("Applying default sort by group column '{}'", groupField);
         }


        if (!orders.isEmpty()) {
            criteriaQuery.orderBy(orders);
        }
    }

    /**
     * Helper method to format the query results into the List<Map<String, Object>> structure
     * expected by AG Grid.
     * @param results The raw results from the JPA query (List<Object[]>).
     * @param request The SSRM request DTO.
     * @param isGrouping True if the request involves grouping.
     * @param isRequestForLeafDataUnderGroup True if requesting leaf data under the deepest group.
     * @param currentGroupingLevel The current depth of the group keys.
     * @param selections The list of JPA selections used in the query.
     * @return A list of maps representing the rows for the AG Grid response.
     */
    private List<Map<String, Object>> formatResults(List<Object[]> results, ServerSideGetRowsRequest request, boolean isGrouping, boolean isRequestForLeafDataUnderGroup, int currentGroupingLevel, List<Selection<?>> selections) {
        List<Map<String, Object>> formattedRows = new ArrayList<>();
        List<String> aliases = selections.stream()
                                        .map(Selection::getAlias)
                                        .collect(Collectors.toList());

        for (Object[] result : results) {
            Map<String, Object> row = new LinkedHashMap<>(); // Use LinkedHashMap to potentially preserve column order

            if (isGrouping && !isRequestForLeafDataUnderGroup) {
                // --- Format Group Rows ---
                // AG Grid requires specific properties for group rows to render correctly.
                // The exact keys might vary slightly with AG Grid version and configuration.
                // Common needs: group value, group key path, aggregated values, and a flag/property
                // to indicate it's a group row.

                String groupField = request.getRowGroupCols().get(currentGroupingLevel).getField();
                Object groupValue = null;
                Object countValue = null;
                // TODO: Extract other aggregation values based on their alias/position in results[]

                // Match results array indices to selection aliases
                for(int i = 0; i < aliases.size() && i < result.length; i++) {
                    if (aliases.get(i) != null) {
                         if (aliases.get(i).equals(groupField)) {
                             groupValue = result[i];
                         } else if (aliases.get(i).equals("agGrid_Count")) { // Match the alias used in select
                             countValue = result[i];
                         }
                         // TODO: Map other aggregation aliases here
                    }
                }


                // Required AG Grid properties for group rows (may need verification for v22 specifics):
                row.put(groupField, groupValue); // The actual value of the group field

                // This property tells AG Grid this is a group row.
                // AG Grid looks for an `agGroupColumn` if configured, or infers from `groupKeys` and data structure.
                // Adding the group field value and potentially an aggregation is often enough.
                // Sometimes `__g[level]` or similar synthetic fields are used by AG Grid internally.
                // You might need to set specific properties if using custom cell renderers for groups.
                // Let's add the group field value keyed by the field name.

                // AG Grid automatically adds `agGroupColumn` or `agGroupCellRenderer` context.
                // The core requirement is to provide the group value keyed by the column field name.
                // Aggregated values should also be provided keyed by their respective field names/aliases.
                row.put("agGrid_Count", countValue); // Add the count under a specific key

                // Add aggregated values under their aliases (e.g., row.put("sum_salary", sumSalaryValue);)


                // AG Grid internally handles the group key path. Providing the group value is key.
                // For expanded groups, the children rows will be fetched on the next call with groupKeys populated.

                logger.debug("Formatted group row: {}", row);


            } else {
                // --- Format Leaf Data Rows ---
                // Match results array indices to selection aliases (assuming selections are ordered as added)
                for(int i = 0; i < aliases.size() && i < result.length; i++) {
                    if (aliases.get(i) != null) {
                         row.put(aliases.get(i), result[i]);
                    }
                }
                 logger.debug("Formatted data row: {}", row);
            }
            formattedRows.add(row);
        }
        return formattedRows;
    }

     /**
      * Helper method to get the JPA Path for a given field name.
      * Includes basic type checking (though buildWherePredicates is better for specific type handling).
      * @param root The Root of the entity.
      * @param fieldName The name of the field.
      * @return The JPA Path for the field.
      * @throws IllegalArgumentException if the field does not exist on the entity.
      */
     private Path<?> getPathForField(Root<Employee> root, String fieldName) {
         // This is a basic helper; buildWherePredicates handles type-specific logic better
         return root.get(fieldName);
     }
}
