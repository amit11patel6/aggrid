import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronRight, Search, Building, Globe, FolderKanban, Users, CheckCircle } from 'lucide-react';

// For Salt DS integration in a real environment, you would typically import components like this:
// import { Button, Checkbox, TextInput, Dropdown, Card, FlexLayout, StackLayout } from '@salt-ds/core';
// import '@salt-ds/core/css/salt-theme.css'; // Or the theme CSS you are using

// --- Mock Data: Shared Hierarchy (The "Source of Truth") ---
const locationNodes = [
    { value: 'north-america', label: 'North America', children: [
            { value: 'usa', label: 'USA', children: [
                    { value: 'california', label: 'California', children: [{ value: 'los-angeles', label: 'Los Angeles' }, { value: 'san-francisco', label: 'San Francisco' }] },
                    { value: 'new-york', label: 'New York', children: [{ value: 'new-york-city', label: 'New York City' }, { value: 'buffalo', label: 'Buffalo' }] },
                ],
            },
            { value: 'canada', label: 'Canada', children: [
                    { value: 'ontario', label: 'Ontario', children: [{ value: 'toronto', label: 'Toronto' }] },
                    { value: 'quebec', label: 'Quebec', children: [{ value: 'montreal', label: 'Montreal' }] },
                ],
            },
        ],
    },
    { value: 'europe', label: 'Europe', children: [
            { value: 'germany', label: 'Germany', children: [{ value: 'berlin', label: 'Berlin' }, { value: 'munich', label: 'Munich' }] },
            { value: 'france', label: 'France', children: [{ value: 'paris', label: 'Paris' }] },
        ],
    },
];

const orgNodes = [
    { value: 'tech-corp', label: 'TechCorp Inc.', children: [
            { value: 'engineering', label: 'Engineering', children: [
                    { value: 'platform', label: 'Platform' },
                    { value: 'product-dev', label: 'Product Development' },
                ],
            },
            { value: 'sales', label: 'Sales', children: [
                    { value: 'enterprise', label: 'Enterprise' },
                    { value: 'smb', label: 'SMB' },
                ],
            },
             { value: 'hr', label: 'Human Resources' },
        ],
    },
];

const projectNodes = [
    { value: 'q3-initiatives', label: 'Q3 Initiatives', children: [
            { value: 'project-phoenix', label: 'Project Phoenix' },
            { value: 'project-titan', label: 'Project Titan' },
        ],
    },
     { value: 'q4-planning', label: 'Q4 Planning', children: [
            { value: 'market-research', label: 'Market Research' },
        ],
    },
];

const HIERARCHY_DATA = {
    location: { nodes: locationNodes, icon: <Globe className="w-5 h-5" />, name: "Locations" },
    organization: { nodes: orgNodes, icon: <Building className="w-5 h-5" />, name: "Organization" },
    project: { nodes: projectNodes, icon: <FolderKanban className="w-5 h-5" />, name: "Projects" },
};

// --- Mock Data: User-Specific Permissions (This would be in your database) ---
const MOCK_USER_PERMISSIONS = {
    'user-admin': {
        id: 'user-admin',
        name: 'Admin User',
        roles: ['admin', 'developer', 'qa'],
        permissions: {
            location: { 'north-america': { read: true, write: true }, 'usa': { read: true, write: true }, 'california': { read: true, write: true }, 'los-angeles': { read: true, write: true }, 'san-francisco': { read: true, write: true }, 'new-york': { read: true, write: true }, 'new-york-city': { read: true, write: true }, 'buffalo': { read: true, write: true }, 'canada': { read: true, write: true }, 'ontario': { read: true, write: true }, 'toronto': { read: true, write: true }, 'quebec': { read: true, write: true }, 'montreal': { read: true, write: true }, 'europe': { read: true, write: true }, 'germany': { read: true, write: true }, 'berlin': { read: true, write: true }, 'munich': { read: true, write: true }, 'france': { read: true, write: true }, 'paris': { read: true, write: true } },
            organization: { 'tech-corp': { read: true, write: true }, 'engineering': { read: true, write: true }, 'platform': { read: true, write: true }, 'product-dev': { read: true, write: true }, 'sales': { read: true, write: true }, 'enterprise': { read: true, write: true }, 'smb': { read: true, write: true }, 'hr': { read: true, write: true } },
            project: { 'q3-initiatives': { read: true, write: true }, 'project-phoenix': { read: true, write: true }, 'project-titan': { read: true, write: true }, 'q4-planning': { read: true, write: true }, 'market-research': { read: true, write: true } }
        }
    },
    'user-editor': {
        id: 'user-editor',
        name: 'Editor User',
        roles: ['editor', 'analyst'],
        permissions: {
            location: { 'europe': { read: true, write: true }, 'germany': { read: true, write: true }, 'berlin': { read: true, write: true }, 'munich': { read: true, write: true }, 'france': { read: true, write: true }, 'paris': { read: true, write: true } },
            organization: { 'tech-corp': { read: true, write: false }, 'sales': { read: true, write: true }, 'enterprise': { read: true, write: true }, 'smb': { read: true, write: true } },
            project: {}
        }
    },
    'user-viewer': {
        id: 'user-viewer',
        name: 'Viewer User',
        roles: ['viewer'],
        permissions: {
            location: { 'north-america': { read: true, write: false }, 'usa': { read: true, write: false }, 'california': { read: true, write: false }, 'los-angeles': { read: true, write: false } },
            organization: { 'tech-corp': { read: true, write: false }, 'engineering': { read: true, write: false } },
            project: { 'q3-initiatives': { read: true, write: false }, 'project-phoenix': { read: true, write: false } }
        }
    }
};

const ALL_ROLES = ['admin', 'editor', 'viewer', 'developer', 'analyst', 'qa'];

// --- Helper Functions ---

/**
 * Recursively extracts all node values (including children) from a given list of nodes.
 * @param {Array<Object>} nodes - The list of nodes to traverse.
 * @returns {Array<string>} An array of all node values.
 */
const getAllNodeValues = (nodes) => {
    let values = [];
    const traverse = (nodeList) => {
        for (const node of nodeList) {
            values.push(node.value);
            if (node.children) {
                traverse(node.children);
            }
        }
    };
    traverse(nodes);
    return values;
};

/**
 * Gets the values of all direct and indirect children of a given node.
 * @param {Object} node - The parent node.
 * @returns {Array<string>} An array of child node values.
 */
const getDescendantValues = (node, values = []) => {
    if (node.children) {
        node.children.forEach(child => {
            values.push(child.value);
            getDescendantValues(child, values);
        });
    }
    return values;
};

/**
 * Finds a node within a hierarchy by its value.
 * @param {Array<Object>} nodes - The root nodes of the hierarchy.
 * @param {string} value - The value of the node to find.
 * @returns {Object|null} The found node object or null if not found.
 */
const findNodeByValue = (nodes, value) => {
    for (const node of nodes) {
        if (node.value === value) {
            return node;
        }
        if (node.children) {
            const found = findNodeByValue(node.children, value);
            if (found) return found;
        }
    }
    return null;
};

// --- Components ---

/**
 * A custom checkbox component that supports an indeterminate state.
 * @param {Object} props - Component props.
 * @param {{checked: boolean, indeterminate: boolean}} props.checkedState - The checked and indeterminate state.
 * @param {function} props.onChange - The change handler for the checkbox.
 * @param {string} props.id - The HTML id for the input element.
 * @param {string} props.className - Additional CSS classes.
 */
const IndeterminateCheckbox = ({ checkedState, onChange, id, className }) => {
    const ref = useRef();

    useEffect(() => {
        if (ref.current) {
            // Set the indeterminate DOM property directly
            ref.current.indeterminate = checkedState.indeterminate;
        }
    }, [checkedState.indeterminate]); // Only re-run if indeterminate state changes

    return (
        <input
            type="checkbox"
            ref={ref}
            id={id}
            className={`form-checkbox h-4 w-4 rounded bg-gray-700 border-gray-600 focus:ring-2 focus:outline-none ${className}`}
            checked={checkedState.checked}
            onChange={onChange}
        />
    );
};

/**
 * Represents a single node in the hierarchical tree, with checkboxes for read/write permissions.
 * @param {Object} props - Component props.
 * @param {Object} props.node - The node object ({ value, label, children }).
 * @param {Object} props.checked - The current checked state of all nodes.
 * @param {Array<string>} props.expanded - Array of expanded node values.
 * @param {function} props.onToggleExpand - Handler to toggle node expansion.
 * @param {function} props.onCheck - Handler to update a node's check state.
 * @param {string} props.searchTerm - The current search term for highlighting.
 */
const TreeNode = ({ node, checked, expanded, onToggleExpand, onCheck, searchTerm }) => {
    const isExpanded = expanded.includes(node.value);
    // Get the specific read/write checked states for the current node
    const nodeReadState = checked[node.value]?.read || { checked: false, indeterminate: false };
    const nodeWriteState = checked[node.value]?.write || { checked: false, indeterminate: false };

    const handleCheck = (type, e) => {
        onCheck(node.value, type, e.target.checked, node);
    };

    const highlightMatch = (text, term) => {
        if (!term) return text;
        const parts = text.split(new RegExp(`(${term})`, 'gi'));
        return (
            <>
                {parts.map((part, i) =>
                    part.toLowerCase() === term.toLowerCase() ? (
                        <span key={i} className="bg-yellow-200 text-black rounded-sm">{part}</span>
                    ) : (
                        part
                    )
                )}
            </>
        );
    };

    return (
        <div className="ml-4 my-1">
            {/* This div could be wrapped by a Salt FlexLayout or similar for layout control */}
            <div className="flex items-center p-2 rounded-lg hover:bg-gray-700/50 transition-colors duration-150">
                <div className="flex items-center flex-grow">
                    {node.children && (
                        <ChevronRight
                            className={`w-5 h-5 mr-2 cursor-pointer transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            onClick={() => onToggleExpand(node.value)}
                        />
                    )}
                    {/* Placeholder for nodes without children to maintain alignment */}
                    {!node.children && <span className="w-5 h-5 mr-2"></span>}
                    <span className="text-sm flex-grow">{highlightMatch(node.label, searchTerm)}</span>
                </div>
                {/* These checkboxes would be Salt Checkbox components in a real Salt DS setup */}
                <div className="flex items-center space-x-6 mr-2">
                    <label htmlFor={`read-${node.value}`} className="flex items-center space-x-2 cursor-pointer text-sm">
                        <IndeterminateCheckbox
                            id={`read-${node.value}`}
                            checkedState={nodeReadState}
                            onChange={(e) => handleCheck('read', e)}
                            className="text-blue-500"
                        />
                        <span>Read</span>
                    </label>
                    <label htmlFor={`write-${node.value}`} className="flex items-center space-x-2 cursor-pointer text-sm">
                        <IndeterminateCheckbox
                            id={`write-${node.value}`}
                            checkedState={nodeWriteState}
                            onChange={(e) => handleCheck('write', e)}
                            className="text-green-500"
                        />
                        <span>Write</span>
                    </label>
                </div>
            </div>
            {isExpanded && node.children && (
                <div className="pl-4 border-l-2 border-gray-700">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.value}
                            node={child}
                            checked={checked}
                            expanded={expanded}
                            onToggleExpand={onToggleExpand}
                            onCheck={onCheck}
                            searchTerm={searchTerm}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * The main tree component for managing permissions with three-state checkboxes.
 * @param {Object} props - Component props.
 * @param {Array<Object>} props.nodes - The root nodes of the hierarchy.
 * @param {Object} props.initialChecked - The initial checked state for all nodes.
 * @param {function} props.onSave - Callback function to save updated permissions.
 * @param {boolean} props.onSaveStatus - Boolean indicating save status for feedback.
 */
const CustomCheckboxTree = ({ nodes, initialChecked, onSave, onSaveStatus }) => {
    const [checked, setChecked] = useState({});
    const [expanded, setExpanded] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Pre-calculate a map for quick parent lookups
    const parentMap = useMemo(() => {
        const map = new Map();
        const buildMap = (nodeList, parent = null) => {
            nodeList.forEach(node => {
                map.set(node.value, parent);
                if (node.children) {
                    buildMap(node.children, node);
                }
            });
        };
        buildMap(nodes);
        return map;
    }, [nodes]);

    // When the initial permissions or nodes change, update the internal state.
    useEffect(() => {
        setChecked(initialChecked || {});
        setSearchTerm(''); // Reset search on data change
        setExpanded([]); // Reset expansion on data change
    }, [initialChecked, nodes]);

    const handleToggleExpand = (value) => {
        setExpanded((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
        );
    };

    /**
     * Updates the checked state of a node and propagates changes up and down the hierarchy.
     * @param {string} nodeValue - The value of the node being updated.
     * @param {'read'|'write'} type - The permission type ('read' or 'write').
     * @param {boolean} isChecked - The new checked status for the permission.
     * @param {Object} node - The node object.
     */
    const handleCheck = (nodeValue, type, isChecked, node) => {
        const newChecked = { ...checked };

        // --- Step 1: Update the clicked node and its descendants ---
        const nodesToUpdate = [nodeValue, ...getDescendantValues(node)];
        nodesToUpdate.forEach(val => {
            const currentPerms = newChecked[val] || { read: { checked: false, indeterminate: false }, write: { checked: false, indeterminate: false } };
            
            // Set the specific permission type
            currentPerms[type] = { checked: isChecked, indeterminate: false };

            // Enforce write implies read, read implies !write
            if (type === 'write' && isChecked) {
                currentPerms.read = { checked: true, indeterminate: false };
            } else if (type === 'read' && !isChecked) {
                currentPerms.write = { checked: false, indeterminate: false };
            }
            newChecked[val] = currentPerms;
        });

        // --- Step 2: Propagate changes upwards to ancestors ---
        let currentNode = node;
        while (true) {
            const parentNode = parentMap.get(currentNode.value);
            if (!parentNode) break; // Reached the root

            const parentNodeValue = parentNode.value;
            const parentPerms = newChecked[parentNodeValue] || { read: { checked: false, indeterminate: false }, write: { checked: false, indeterminate: false } };

            // Find the actual node object for parentNode from the main hierarchy to get its children
            const actualParentNode = findNodeByValue(nodes, parentNodeValue);
            if (!actualParentNode || !actualParentNode.children) {
                console.warn(`Could not find actual parent node or its children for value: ${parentNodeValue}`);
                break;
            }

            // Evaluate parent's state based on its direct children
            const childrenPerms = actualParentNode.children.map(child => newChecked[child.value]?.[type] || { checked: false, indeterminate: false });

            const allChildrenChecked = childrenPerms.every(p => p.checked && !p.indeterminate);
            const allChildrenUnchecked = childrenPerms.every(p => !p.checked && !p.indeterminate);
            const anyChildrenChecked = childrenPerms.some(p => p.checked || p.indeterminate); // If any child is checked or indeterminate

            if (allChildrenChecked) {
                parentPerms[type] = { checked: true, indeterminate: false };
            } else if (allChildrenUnchecked) {
                parentPerms[type] = { checked: false, indeterminate: false };
            } else {
                // If mixed state, it's indeterminate. The 'checked' property for indeterminate usually true if any child is checked.
                parentPerms[type] = { checked: anyChildrenChecked, indeterminate: true };
            }

            // Apply dependency rules for parent as well
            if (type === 'write') { // If updating write, read state might need adjustment
                 if (parentPerms.write.checked && !parentPerms.write.indeterminate) {
                     parentPerms.read = { checked: true, indeterminate: false }; // If write is fully checked, read is fully checked
                 } else if (!parentPerms.write.checked && !parentPerms.write.indeterminate) {
                     // If write is fully unchecked, read doesn't change based on write for now, but if read was indeterminate, it should be re-evaluated
                     // This scenario is complex, but for simplicity, if write goes to false, read just needs to be at least false or re-evaluated.
                     // The propagation will handle read's state correctly on its own as it goes up.
                 } else if (parentPerms.write.indeterminate) {
                     // If write is indeterminate, read might also become indeterminate if it wasn't already fully checked
                     if (!parentPerms.read.checked || parentPerms.read.indeterminate) {
                         // Only set read to indeterminate if it's not already fully checked
                         const readChildrenPerms = actualParentNode.children.map(child => newChecked[child.value]?.['read'] || { checked: false, indeterminate: false });
                         const allReadChildrenChecked = readChildrenPerms.every(p => p.checked && !p.indeterminate);
                         const allReadChildrenUnchecked = readChildrenPerms.every(p => !p.checked && !p.indeterminate);
                         const anyReadChildrenChecked = readChildrenPerms.some(p => p.checked || p.indeterminate);

                         if (allReadChildrenChecked) {
                             parentPerms.read = { checked: true, indeterminate: false };
                         } else if (allReadChildrenUnchecked) {
                             parentPerms.read = { checked: false, indeterminate: false };
                         } else {
                             parentPerms.read = { checked: anyReadChildrenChecked, indeterminate: true };
                         }
                     }
                 }
            } else if (type === 'read' && !isChecked) { // If read is unchecked, write must be unchecked
                parentPerms.write = { checked: false, indeterminate: false };
            }

            newChecked[parentNodeValue] = parentPerms;
            currentNode = parentNode; // Move up to the next parent
        }

        setChecked(newChecked);
    };
    
    // Memoize filtered nodes for performance with search
    const filteredNodes = useMemo(() => {
        if (!searchTerm) return nodes;
        const newExpanded = new Set(); // To automatically expand matching nodes
        function filter(nodeList) {
            return nodeList.reduce((acc, node) => {
                const isMatch = node.label.toLowerCase().includes(searchTerm.toLowerCase());
                let children = [];
                if (node.children) {
                    children = filter(node.children);
                }
                if (isMatch || children.length > 0) {
                    if(children.length > 0) newExpanded.add(node.value); // Expand parent if children match
                    acc.push({ ...node, children });
                }
                return acc;
            }, []);
        }
        const result = filter(nodes);
        setExpanded(Array.from(newExpanded)); // Set the expanded state based on search results
        return result;
    }, [searchTerm, nodes]);

    return (
        // This outer div could be a Salt Card component
        <div className="bg-gray-800 text-white rounded-xl shadow-2xl p-6 w-full h-full flex flex-col">
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                {/* This input would be a Salt TextInput component */}
                <input
                    type="text"
                    placeholder="Search and filter nodes..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex-grow overflow-y-auto pr-2">
                {filteredNodes.map((node) => (
                    <TreeNode
                        key={node.value}
                        node={node}
                        checked={checked}
                        expanded={expanded}
                        onToggleExpand={handleToggleExpand}
                        onCheck={handleCheck}
                        searchTerm={searchTerm}
                    />
                ))}
            </div>
             <div className="pt-4 mt-4 border-t border-gray-700 flex justify-end items-center gap-4">
                {onSaveStatus && <span className="text-green-400 flex items-center gap-2"><CheckCircle size={20}/> Permissions updated!</span>}
                {/* This button would be a Salt Button component */}
                <button 
                    onClick={() => onSave(checked)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 shadow-lg"
                >
                    Update Permissions
                </button>
            </div>
        </div>
    );
};


/**
 * Main application component responsible for overall layout and state management.
 */
export default function App() {
    // Initialize with a default selected user
    const [selectedUserId, setSelectedUserId] = useState('user-admin');
    const [selectedUserRoles, setSelectedUserRoles] = useState(MOCK_USER_PERMISSIONS['user-admin'].roles || []);
    const [activeHierarchyKey, setActiveHierarchyKey] = useState('location');
    const [allUserPermissions, setAllUserPermissions] = useState(MOCK_USER_PERMISSIONS);
    const [saveStatus, setSaveStatus] = useState(false);

    // Prepare initial checked state for CustomCheckboxTree to match new structure
    const initialCheckedPermissions = useMemo(() => {
        if (!selectedUserId) return {};
        const userPerms = allUserPermissions[selectedUserId]?.permissions[activeHierarchyKey] || {};
        const transformedPerms = {};
        // Iterate over the mock permissions and transform them into the new { checked, indeterminate } structure
        for (const [nodeValue, perms] of Object.entries(userPerms)) {
            transformedPerms[nodeValue] = {
                read: { checked: perms.read, indeterminate: false },
                write: { checked: perms.write, indeterminate: false }
            };
        }
        return transformedPerms;
    }, [selectedUserId, activeHierarchyKey, allUserPermissions]);

    // Handle user selection from the dropdown
    const handleSelectUser = (userId) => {
        setSelectedUserId(userId);
        setSelectedUserRoles(allUserPermissions[userId]?.roles || []);
        setActiveHierarchyKey('location'); // Reset to default hierarchy when a new user is selected
    };

    const handleSavePermissions = (updatedPermissions) => {
        console.log("Saving for:", selectedUserId, "in", activeHierarchyKey);
        console.log("Data to save:", updatedPermissions);

        // Transform back to simpler { read: true/false, write: true/false } structure for mock database
        const simplifiedPermissions = {};
        for (const [nodeValue, perms] of Object.entries(updatedPermissions)) {
            simplifiedPermissions[nodeValue] = {
                read: perms.read.checked,
                write: perms.write.checked
            };
        }

        // Simulate updating the database
        const newAllPermissions = { ...allUserPermissions };
        newAllPermissions[selectedUserId].permissions[activeHierarchyKey] = simplifiedPermissions;
        setAllUserPermissions(newAllPermissions);

        // Show save confirmation
        setSaveStatus(true);
        setTimeout(() => setSaveStatus(false), 2000);
    };

    // Handle changes to selected roles (for mock display, not saving back)
    const handleRoleChange = (e) => {
        const { options } = e.target;
        const newRoles = [];
        for (let i = 0, l = options.length; i < l; i++) {
            if (options[i].selected) {
                newRoles.push(options[i].value);
            }
        }
        setSelectedUserRoles(newRoles);
        // In a real app, you'd trigger a save here to update user's roles in backend
    };

    const { nodes, name } = HIERARCHY_DATA[activeHierarchyKey];

    return (
        <main className="bg-gray-900 min-h-screen flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-7xl h-[90vh] mx-auto flex gap-6">
                
                {/* This sidebar could be a Salt Card or part of a larger layout component */}
                <div className="w-1/4 flex-shrink-0 bg-gray-800/50 rounded-xl p-6 shadow-lg flex flex-col">
                    <h2 className="text-xl font-bold text-white mb-6">Access Control</h2>
                    <nav className="space-y-2">
                        {Object.entries(HIERARCHY_DATA).map(([key, { name, icon }]) => (
                            <button
                                key={key}
                                onClick={() => setActiveHierarchyKey(key)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                                    activeHierarchyKey === key
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-300 hover:bg-gray-700/50'
                                }`}
                            >
                                {icon}
                                <span className="font-medium">{name}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="w-3/4 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-2xl font-bold text-white">
                            Permissions for: <span className="text-blue-400">{name}</span>
                        </h1>
                        <div className="flex items-center gap-3 bg-gray-800/50 p-2 rounded-lg">
                            <Users className="text-gray-400"/>
                             {/* This select dropdown would be a Salt Dropdown/Select component */}
                             <select
                                value={selectedUserId}
                                onChange={(e) => handleSelectUser(e.target.value)} // Allows admin to switch users easily
                                className="bg-transparent text-white border-none focus:ring-0"
                            >
                                {Object.values(MOCK_USER_PERMISSIONS).map(user => (
                                    <option key={user.id} value={user.id} className="bg-gray-800">
                                        {user.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Roles Multi-select Dropdown */}
                    <div className="mb-6 bg-gray-800 rounded-xl p-4 shadow-xl">
                        <h3 className="text-lg font-semibold text-white mb-3">User Roles</h3>
                        <label htmlFor="user-roles" className="sr-only">Select User Roles</label>
                        {/* This multiselect would be a Salt Multiselect/Pillbox component */}
                        <select
                            id="user-roles"
                            multiple
                            value={selectedUserRoles}
                            onChange={handleRoleChange}
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            size={Math.min(ALL_ROLES.length, 5)} // Show a few options by default
                        >
                            {ALL_ROLES.map(role => (
                                <option key={role} value={role} className="bg-gray-800 py-1">
                                    {role}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-2">Hold Ctrl/Cmd to select multiple roles.</p>
                    </div>

                    <CustomCheckboxTree 
                        // Using a key here forces re-mounting the component when user or hierarchy changes
                        // This ensures the state is properly reset based on initialCheckedPermissions
                        key={`${selectedUserId}-${activeHierarchyKey}`} 
                        nodes={nodes}
                        initialChecked={initialCheckedPermissions} // Pass the transformed initial state
                        onSave={handleSavePermissions}
                        onSaveStatus={saveStatus}
                    />
                </div>

            </div>
        </main>
    );
}
