export interface ServerSideGetRowsRequest {
    startRow: number;
    endRow: number;
    rowGroupCols: { id: string; field: string; displayName: string; aggFunc?: string | null }[];
    groupKeys: string[];
    filterModel: { [key: string]: any };
    sortModel: { colId: string; sort: 'asc' | 'desc' }[];
    valueCols?: { id: string; field: string; displayName: string; aggFunc?: string | null }[];
    pivotCols?: { id: string; field: string; displayName: string; aggFunc?: string | null }[];
    pivotMode?: boolean;
}

export interface ServerSideGetRowsResponse {
    rows: any[];
    lastRow: number;
}
/////
import { ColDef } from 'ag-grid-community';

export const employeeColumnDefs: ColDef[] = [
    { field: 'id', headerName: 'ID', filter: 'agNumberColumnFilter', sortable: true },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', sortable: true },
    { field: 'department', headerName: 'Department', filter: 'agTextColumnFilter', sortable: true, rowGroup: true },
    { field: 'jobTitle', headerName: 'Job Title', filter: 'agTextColumnFilter', sortable: true, rowGroup: true },
    { field: 'salary', headerName: 'Salary', filter: 'agNumberColumnFilter', sortable: true, aggFunc: 'sum' },
    { field: 'hireDate', headerName: 'Hire Date', filter: 'agDateColumnFilter', sortable: true },
];

////
import axios from 'axios';
import { ServerSideGetRowsRequest, ServerSideGetRowsResponse } from './types';

export const createServerSideDatasource = (url: string) => {
    return {
        getRows: (params: any) => {
            console.log('AG Grid requesting data:', params.request);

            const requestBody: ServerSideGetRowsRequest = {
                startRow: params.request.startRow,
                endRow: params.request.endRow,
                rowGroupCols: params.request.rowGroupCols,
                groupKeys: params.request.groupKeys,
                filterModel: params.request.filterModel,
                sortModel: params.request.sortModel,
                valueCols: params.request.valueCols,
                pivotCols: params.request.pivotCols,
                pivotMode: params.request.pivotMode,
            };

            axios.post<ServerSideGetRowsResponse>(url, requestBody)
                .then(response => {
                    const { rows, lastRow } = response.data;
                    console.log(`Received ${rows.length} rows, lastRow: ${lastRow}`);
                    params.successCallback(rows, lastRow);
                })
                .catch(error => {
                    console.error('Error fetching data from backend:', error);
                    params.failCallback();
                });
        },
    };
};
///////
import React, { useRef, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

import { employeeColumnDefs } from './columnDefs';
import { createServerSideDatasource } from './datasource';

interface EmployeeGridProps {
    backendUrl?: string;
}

const EmployeeGrid: React.FC<EmployeeGridProps> = ({ backendUrl = 'http://localhost:8080/api/employees/ssrm-data' }) => {
    const gridRef = useRef<AgGridReact>(null);

    const defaultColDef = useMemo<ColDef>(() => ({
        flex: 1,
        minWidth: 100,
        resizable: true,
    }), []);

    const gridOptions = useMemo(() => ({
        rowModelType: 'serverSide' as const,
        serverSideDatasource: createServerSideDatasource(backendUrl),
        cacheBlockSize: 100,
        maxBlocksInCache: -1,
        rowGroupPanelShow: 'always' as const,
    }), [backendUrl]);

    const onRefreshClick = useCallback(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.refreshServerSideStore({ purge: true });
        }
    }, []);

    return (
        <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
            <h2>Employee Data (Server-Side Rendering)</h2>
            <p>This grid fetches data from: <code>{backendUrl}</code></p>
            <AgGridReact
                ref={gridRef}
                columnDefs={employeeColumnDefs}
                defaultColDef={defaultColDef}
                gridOptions={gridOptions}
            />
            <button onClick={onRefreshClick} style={{ marginTop: '10px', padding: '8px 16px' }}>
                Refresh Data
            </button>
        </div>
    );
};

export default EmployeeGrid;
//////
