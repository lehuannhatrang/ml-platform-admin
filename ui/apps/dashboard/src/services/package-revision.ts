import { IResponse, karmadaClient, ObjectMeta } from "./base";

// PackageRev resource interfaces
export interface PackageRev {
    metadata: PackageRevisionMetadata;
    spec: PackageRevisionSpec;
    status?: PackageRevStatus;
    kind: string;
    apiVersion: string;
}

export type PackageRevisionMetadata = {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
  labels?: { [key: string]: string };
};


export type PackageRevisionSpec = {
    packageName: string;
    repository: string;
    workspaceName?: string;
    revision?: string;
    lifecycle: PackageRevisionLifecycle;
    tasks: PackageRevisionTask[];
    readinessGates?: {
        conditionType: string;
    }[];
};

export interface PackageRevStatus {
    revision: string;
    workloadIdentity?: string;
    [key: string]: any;
}

export enum PackageRevisionLifecycle {
    DRAFT = 'Draft',
    PROPOSED = 'Proposed',
    PUBLISHED = 'Published',
}

export interface PackageResource {
    apiVersion: string;
    kind: string;
    metadata: ObjectMeta;
    spec?: any;
    [key: string]: any;
}

export interface PackageRevisionResources {
    apiVersion: string;
    kind: string;
    metadata: ObjectMeta;
    spec?: {
        packageName: string;
        repository: string;
        revision: string;
        workspaceName?: string;
        resources: {
            [key: string]: string;
        };
    }
    status: {
        renderStatus: {
            result: any
            error: string
        }
    };
}

export type PackageRevisionTask = {
    type: string;
    init?: PackageRevisionTaskInit;
    clone?: PackageRevisionTaskClone;
    update?: PackageRevisionTaskUpdate;
    eval?: PackageRevisionTaskEval;
};

export type PackageRevisionTaskInit = {
    description: string;
    keywords?: string[];
    site?: string;
};

export type PackageRevisionTaskClone = {
    upstreamRef: PackageRevisionTaskUpstreamRef;
};

export type PackageRevisionTaskUpdate = {
    upstreamRef: PackageRevisionTaskUpstreamRef;
};

export type PackageRevisionTaskUpstreamRef = {
    upstreamRef: PackageRevisionTaskNamedRepository;
};

export type PackageRevisionTaskNamedRepository = {
    name: string;
};

export type PackageRevisionTaskEval = {
    image: string;
    configMap: PackageRevisionTaskEvalConfigMap;
};

export type PackageRevisionTaskEvalConfigMap = {
    [key: string]: string;
};

// PackageRev API methods
export async function GetPackageRevs() {
    const resp = await karmadaClient.get<{
        items: PackageRev[];
        totalResources: number;
    }>('/mgmt-cluster/porch/packagerevision');
    return resp.data;
}

// Fetch package revision resources
export async function GetPackageRevisionResources(name: string) {
    const resp = await karmadaClient.get<PackageRevisionResources>(`/mgmt-cluster/porch/packagerevisionresources/${name}`);
    return resp.data;
}

// Update package revision resources
export async function UpdatePackageRevisionResources(name: string, resources: PackageRevisionResources) {
    const resp = await karmadaClient.put<IResponse<PackageRevisionResources>>(
        `/mgmt-cluster/porch/packagerevisionresources/${name}`,
        resources
    );
    return resp.data;
}

export async function GetPackageRev(name: string) {
    const resp = await karmadaClient.get<PackageRev>(
        `/mgmt-cluster/porch/packagerevision/${name}`
    );
    return resp.data;
}

export async function CreatePackageRev(packageRev: any) {
    const resp = await karmadaClient.post<IResponse<PackageRev>>(
        '/mgmt-cluster/porch/packagerevision',
        packageRev
    );
    return resp.data;
}

export async function UpdatePackageRev(name: string, packageRev: any) {
    const resp = await karmadaClient.put<IResponse<PackageRev>>(
        `/mgmt-cluster/porch/packagerevision/${name}`,
        packageRev
    );
    return resp.data;
}

export async function DeletePackageRev(name: string) {
    const resp = await karmadaClient.delete<
        IResponse<{
            message: string;
        }>
    >(`/mgmt-cluster/porch/packagerevision/${name}`);
    return resp.data;
}

export async function ApprovePackageRev(name: string, packageRev: any) {
    const resp = await karmadaClient.put<IResponse<PackageRev>>(
        `/mgmt-cluster/porch/packagerevision/${name}/approval`,
        packageRev
    );
    return resp.data;
}


export const getInitTask = (description: string, keywords: string[], site: string): PackageRevisionTask => {
    const initTask: PackageRevisionTask = {
        type: 'init',
        init: {
            description,
            keywords,
            site,
        },
    };

    return initTask;
};

export function getCloneTask(fullPackageName: string): PackageRevisionTask {
    const cloneTask: PackageRevisionTask = {
        type: 'clone',
        clone: {
            upstreamRef: {
                upstreamRef: {
                    name: fullPackageName,
                },
            },
        },
    };

    return cloneTask;
}

export const getUpdateTask = (fullUpstreamPackageName: string): PackageRevisionTask => {
    const updateTask: PackageRevisionTask = {
        type: 'update',
        update: {
            upstreamRef: {
                upstreamRef: {
                    name: fullUpstreamPackageName,
                },
            },
        },
    };

    return updateTask;
};

export const getPackageRevisionResource = (
    repositoryName: string,
    packageName: string,
    workspaceName: string,
    lifecycle: PackageRevisionLifecycle,
    tasks: PackageRevisionTask[],
): PackageRev => {
    const resource: PackageRev = {
        apiVersion: 'porch.kpt.dev/v1alpha1',
        kind: 'PackageRevision',
        metadata: {
            name: '', // Porch will populate
        },
        spec: {
            packageName: packageName,
            workspaceName: workspaceName,
            repository: repositoryName,
            lifecycle: lifecycle,
            tasks: tasks,
        },
    };

    return resource;
};