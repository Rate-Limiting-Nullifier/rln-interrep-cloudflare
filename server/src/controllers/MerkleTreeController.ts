import config from "../config"
import {
  MerkleTreeNode,
  MerkleTreeZero,
} from "../models/MerkleTree/MerkleTree.model";
import GroupController from "./GroupController";
import { IMerkleTreeNodeDocument } from "../models/MerkleTree/MerkleTree.types";
import poseidonHash from "../utils/hasher";


class MerkleTreeController {

  groupController: GroupController;

  constructor(
    groupController: GroupController,
  ) {
    this.groupController = groupController;
  }

  public syncTree = async (
    groupId: string,
    idCommitments: string[]
  ): Promise<boolean> => {
    const leavesData = idCommitments.map(idCommitment => { return {"groupId": groupId, "commitment": idCommitment}});
    return await this.addLeaves(leavesData);
  };

  private addLeaves = async (ids: Record<string, string>[]) => {

    for (const id of ids) {
      await this.appendLeaf(id.groupId, id.commitment, true);
    }

    return true;

  }

  public appendLeaf = async (
    groupId: string,
    idCommitment: string,
    isUpdate: boolean = false
  ): Promise<string> => {
    const groupExists = await this.groupController.groupExists(groupId);

    if (!groupExists) {
      throw new Error(`The group ${groupId} does not exist`);
    }

    if(!isUpdate || idCommitment !== BigInt(0).toString()) {
      if (await MerkleTreeNode.findLeafByGroupIdAndHash(groupId, idCommitment)) {
        throw new Error(`The identity commitment ${idCommitment} already exist`);
      }
    }

    // Get the zero hashes.
    const zeroes = await MerkleTreeZero.findZeroes();

    if (!zeroes || zeroes.length === 0) {
      throw new Error(`The zero hashes have not yet been created`);
    }

    // Get next available index at level 0.
    let currentIndex = await MerkleTreeNode.getNumberOfNodes(groupId, 0);

    if (currentIndex >= 2 ** config.MERKLE_TREE_LEVELS) {
      throw new Error(`The tree is full`);
    }

    let node: any = await MerkleTreeNode.create({
      key: { groupId, level: 0, index: currentIndex },
      hash: idCommitment,
    });

    for (let level = 0; level < config.MERKLE_TREE_LEVELS; level++) {
      if (currentIndex % 2 === 0) {
        node.siblingHash = zeroes[level].hash;

        let parentNode = await MerkleTreeNode.findByLevelAndIndex({
          groupId,
          level: level + 1,
          index: Math.floor(currentIndex / 2),
        });

        if (parentNode) {
          parentNode.hash = poseidonHash([
            BigInt(node.hash),
            BigInt(node.siblingHash),
          ]).toString();

          await parentNode.save();
        } else {
          parentNode = await MerkleTreeNode.create({
            key: {
              groupId,
              level: level + 1,
              index: Math.floor(currentIndex / 2),
            },
            hash: poseidonHash([BigInt(node.hash), BigInt(node.siblingHash)]),
          });
        }

        node.parent = parentNode;

        await node.save();

        node = parentNode;
      } else {
        const siblingNode = (await MerkleTreeNode.findByLevelAndIndex({
          groupId,
          level,
          index: currentIndex - 1,
        })) as IMerkleTreeNodeDocument;

        node.siblingHash = siblingNode.hash;
        siblingNode.siblingHash = node.hash;

        const parentNode = (await MerkleTreeNode.findByLevelAndIndex({
          groupId,
          level: level + 1,
          index: Math.floor(currentIndex / 2),
        })) as IMerkleTreeNodeDocument;

        parentNode.hash = poseidonHash([
          BigInt(siblingNode.hash),
          BigInt(node.hash),
        ]).toString();

        node.parent = parentNode;

        await node.save();
        await parentNode.save();
        await siblingNode.save();

        node = parentNode;
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return node.hash;
  };

  public updateLeaf = async (groupId: string, leafHash: string, newValue: string = config.ZERO_VALUE.toString()) => {
    let node = await MerkleTreeNode.findLeafByGroupIdAndHash(
      groupId,
      leafHash
    );

    if (!node) {
      throw new Error(
        `The user with identity commitment ${leafHash} doesn't exists`
      );
    }

    node.hash = newValue;
    await node.save();

    while(node && node.parent) {

      const nodeIndex = node.key.index;
      const siblingHash = BigInt(node.siblingHash as string);
      const nodeHash = BigInt(node.hash);

      const parent = await MerkleTreeNode.findByLevelAndIndex({
        groupId,
        level: node.key.level + 1,
        index: Math.floor(nodeIndex / 2),
      });

      const childrenHashes = nodeIndex % 2 === 0 ? [nodeHash, siblingHash] : [siblingHash, nodeHash];
      parent.hash = poseidonHash(childrenHashes).toString();

      await parent.save();
      node = parent;
    }

  };



  public retrievePath = async (
    groupId: string,
    idCommitment: string
  ): Promise<any> => {
    const groupExists = await this.groupController.groupExists(groupId);

    if (!groupExists) {
      throw new Error(`The group ${groupId} does not exist`);
    }

    // Get path starting from leaf node.
    const leafNode = await MerkleTreeNode.findLeafByGroupIdAndHash(
      groupId,
      idCommitment
    );

    if (!leafNode) {
      throw new Error(`The identity commitment does not exist`);
    }

    const { key } = leafNode;

    // Get path and return array.
    const pathQuery = MerkleTreeNode.aggregate([
      {
        $match: {
          key,
        },
      },
      {
        $graphLookup: {
          from: "treeNodes",
          startWith: "$_id",
          connectFromField: "parent",
          connectToField: "_id",
          as: "path",
          depthField: "level",
        },
      },
      {
        $unwind: {
          path: "$path",
        },
      },
      {
        $project: {
          path: 1,
          _id: 0,
        },
      },
      {
        $addFields: {
          hash: "$path.hash",
          sibling: "$path.siblingHash",
          index: { $mod: ["$path.key.index", 2] },
          level: "$path.level",
        },
      },
      {
        $sort: {
          level: 1,
        },
      },
      {
        $project: {
          path: 0,
        },
      },
    ]);

    return new Promise((resolve, reject) => {
      pathQuery.exec((error, path) => {
        if (error) {
          reject(error);
        }

        const root = path.pop().hash;
        const pathElements = path.map((n) => n.sibling);
        const indices = path.map((n) => n.index);

        resolve({ pathElements, indices, root });
      });
    });
  };
}

export default MerkleTreeController;
