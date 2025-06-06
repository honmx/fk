import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/createUserDto';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './models/user.model';
import { GetUserByEmailDto } from './dto/getUserByEmailDto';
import { Role } from './models/role.model';
import { GetUserByIdDto } from './dto/getUserByIdDto';
import { ChangePasswordDto } from './dto/changePasswordDto';
import { CreateCoachDto } from './dto/createCoachDto';
import { GetUsersByIdDto } from './dto/getUsersByIdDto';
import { Includeable, Op } from 'sequelize';
import { UploadMedicalDocumentPhotoDto } from './dto/uploadMedicalDocumentPhotoDto';
import { MedicalDocument } from './models/medicalDocument.model';
import { SetMedicalDocumentExpirationDto } from './dto/setMedicalDocumentExpirationDto';
import { UploadInsurancePhotoDto } from './dto/uploadInsurancePhotoDto';
import { Insurance } from './models/insurance.model';
import { SetInsuranceExpirationDto } from './dto/setInsuranceExpirationDto';
import { GetUsersByGroupIdDto } from './dto/getUsersByGroupIdDto';
import { Group } from 'apps/groups/src/models/group.model';
import { PersonTraining } from 'apps/groups/src/models/personTraining.model';
import { RemoveGroupDto } from './dto/removeGroupDto';
import { filter, lastValueFrom } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';
import { ChangeGroupDto } from './dto/changeGroupDto';
import { ChangeRoleDto } from './dto/changeRoleDto';
import { DeleteRoleDto } from './dto/deleteRoleDto';
import { MarkAttendanceDto } from './dto/markAttendanceDto';
import { IAttendanceValue } from '@app/common/types/IAttendanceValue';
import { UserGroups } from './models/userGroups.model';
import { GetUsersAbleToHaveGroupDto } from './dto/getUsersAbleToHaveGroupDto';
import { GetUsersLazyDto } from './dto/getUsersLazyDto';
import { GetUsersAbleToHaveGroupLazyDto } from './dto/getUsersAbleToHaveGroupLazyDto';
import { ClearHistoryOnGroupDeleteDto } from './dto/clearHistoryOnGroupDeleteDto';
import { UploadAvatarDto } from './dto/uploadAvatarDto';
import { ChangeTrainingsLeftDto } from './dto/changeTrainingsLeftDto';
import { isErrored } from 'stream';
import { GetUserTrainingsHistoryLazyDto } from './dto/getUserTrainingsHistoryLazyDto';
import { ChangeVacationStatusDto } from './dto/changeVacationStatusDto';
import { GetCurrentSubscriptionTrainingsHistoryDto } from './dto/getCurrentSubscriptionTrainingsHistoryDto';
import { GetUsersTrainingsSeparatedBySubscriptionsDto } from './dto/getUsersTrainingsSeparatedBySubscriptionsDto';
import { TrainingByDay } from 'apps/groups/src/models/trainingByDay.model';
import { IPersonTrainingWithIsAccountable } from './types/IPersonTrainingWithIsAccountable';
import { INormalizedHistory } from './types/INormalizedHistory';
import { ChangeNameDto } from './dto/changeNameDto';
import { ChangeParentNameDto } from './dto/changeParentNameDto';
// import { createRoleDto } from 'apps/backend/src/users/dto/createRoleDto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private usersRepository: typeof User,
    @InjectModel(UserGroups) private userGroupsRepository: typeof UserGroups,
    @InjectModel(Role) private rolesRepository: typeof Role,
    @InjectModel(MedicalDocument) private medicalDocumentsRepository: typeof MedicalDocument,
    @InjectModel(Insurance) private insurancesRepository: typeof Insurance,
    @InjectModel(PersonTraining) private personTrainingsRepository: typeof PersonTraining,
    @Inject("GROUPS") private groupsClient: ClientProxy,
  ) { }

  async getUsers() {
    const users = await this.usersRepository.findAll({
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
        { model: Role },
      ]
    });
    return users;
  }

  async getUsersLazy(dto: GetUsersLazyDto) {
    const users = await this.usersRepository.findAll({
      where: { name: { [Op.iRegexp]: dto.name } },
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
        { model: Role },
      ],
      offset: dto.filterId === 1 ? dto.offset : 0,
      order: [["name", "ASC"], ["email", "ASC"]],
      limit: dto.filterId === 1 ? 15 : 10000
    });

    if (dto.filterId === 1) return users;

    const filterValues = this.getUserFilterValues();
    return users
      .filter(filterValues.find(value => value.id === dto.filterId)?.filterFn || (() => true))
      .slice(dto.offset, dto.offset + 10);
  }

  async getUsersAbleToHaveGroupLazy(dto: GetUsersAbleToHaveGroupLazyDto) {
    const usersWithSpecifiedGroupId = (await this.userGroupsRepository.findAll({
      where: { groupId: dto.groupId }
    }))
      .map(item => item.userId);

    const users = await this.usersRepository.findAll({
      where: { type: "user", name: { [Op.iRegexp]: dto.name }, id: { [Op.not]: usersWithSpecifiedGroupId } },
      attributes: ["id", "name", "photo", "birth"],
      include: [
        { model: Group, attributes: ["id", "name", "amountOfTrainingsInSubscription"] }
      ],
      order: [["name", "ASC"], ["email", "ASC"]]
    });

    const usersWithTwoGroupsId = (await this.userGroupsRepository.findAll())
      .map(item => item.userId)
      .filter((userId, index, array) => array.indexOf(userId) !== array.lastIndexOf(userId));

    return users.filter(user => !usersWithTwoGroupsId.includes(user.id)
      && (user.groups.length === 0
        || user.groups.length === 1 && user.groups[0].amountOfTrainingsInSubscription === Number(dto.amountOfTrainingsInSubscription)
      )
    ).slice(dto.offset, dto.offset + 10);
  }

  async getUsersWithoutGroup() {
    const users = await this.usersRepository.findAll({
      where: { type: "user" },
      attributes: ["id", "name", "photo", "birth"]
    });

    const usersWithGroupsId = (await this.userGroupsRepository.findAll()).map(item => item.userId);

    return users.filter(user => !usersWithGroupsId.includes(user.id));
  }

  async getUsersAbleToHaveGroup(dto: GetUsersAbleToHaveGroupDto) {
    const usersWithSpecifiedGroupId = (await this.userGroupsRepository.findAll({ where: { groupId: dto.groupId } }))
      .map(item => item.userId);

    const users = await this.usersRepository.findAll({
      where: { type: "user", id: { [Op.not]: usersWithSpecifiedGroupId } },
      attributes: ["id", "name", "photo", "birth"],
      include: [
        { model: Group, attributes: ["id", "name", "amountOfTrainingsInSubscription"] }
      ],
      order: [["name", "ASC"]]
    });

    const usersWithTwoGroupsId = (await this.userGroupsRepository.findAll())
      .map(item => item.userId)
      .filter((userId, index, array) => array.indexOf(userId) !== array.lastIndexOf(userId));

    return users.filter(user => !usersWithTwoGroupsId.includes(user.id)
      && (user.groups.length === 0
        || user.groups.length === 1 && user.groups[0].amountOfTrainingsInSubscription === Number(dto.amountOfTrainingsInSubscription)
      )
    );
  }

  async createUser(dto: CreateUserDto) {
    const newUser = await this.usersRepository.create({ ...dto, type: "user" });
    const role = await this.rolesRepository.findOne({ where: { value: "USER" } });

    if (!newUser) return new BadRequestException("User hasnt been created");
    if (!role) return new BadRequestException("Role hasnt been found");

    await newUser.$set("role", role.id);

    const user = await this.getUserByEmail({ email: newUser.email });

    if (!user) return new BadRequestException("User hasnt been found");

    return user;
  }

  async createCoach(dto: CreateCoachDto) {
    const newCoach = await this.usersRepository.create({ ...dto, type: "coach" });

    if (!newCoach) {
      return new BadRequestException("User hasnt been created");
    }

    const user = await this.getUserByEmail({ email: newCoach.email });

    if (!user) {
      return new BadRequestException("User hasnt been found");
    }

    return user;
  }

  async getUserByEmail(dto: GetUserByEmailDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
      include: [
        { model: Group },
        { model: Role },
        { model: MedicalDocument },
        { model: Insurance },
      ],
    });

    return user;
  }

  async getUserById(dto: GetUserByIdDto) {
    const user = await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group },
        { model: Role },
        { model: MedicalDocument },
        { model: Insurance },
      ],
    });

    return user;
  }

  async getUserTrainingsHistoryLazy(dto: GetUserTrainingsHistoryLazyDto) {
    const trainings = await this.personTrainingsRepository.findAll({
      where: { userId: dto.id },
      include: { all: true, nested: true },
    });

    trainings.sort((a, b) => this.getDateFromString(b.training.date).getTime() - this.getDateFromString(a.training.date).getTime())

    return trainings.slice(dto.offset, dto.offset + 10);
  }

  async getUsersById(dto: GetUsersByIdDto, include?: Includeable | Includeable[]) {
    const user = await this.usersRepository.findAll({
      where: { type: "user", [Op.or]: dto.usersId.map(id => ({ id })) },
      include: include || []
    });

    return user;
  }

  async getUsersByGroupId(dto: GetUsersByGroupIdDto) {

    if (!dto.groupId) {
      return new BadRequestException("Произошла ошибка. Перезагрузите страницу и попробуйте снова");
    }

    const usersId = Array.from(new Set((await this.userGroupsRepository.findAll({ where: { groupId: dto.groupId } })).map(item => item.userId)));

    const users = await this.usersRepository.findAll({
      where: { id: { [Op.or]: usersId } },
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
      ]
    });

    return users;
  }

  async changePassword(dto: ChangePasswordDto) {
    const user = await this.usersRepository.update({ password: dto.password }, { where: { email: dto.email } });
    return user;
  }

  async removeGroup(dto: RemoveGroupDto) {
    const user = await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group, attributes: { exclude: ["createdAt", "updatedAt"] } }
      ]
    });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    const personTrainings: PersonTraining[] = await lastValueFrom(this.groupsClient.send(
      "get-all-person-trainings",
      { userId: user.id, trainingByDayId: null }
    ));

    personTrainings.sort((a, b) => this.getDateFromString(a.training.date).getTime() - this.getDateFromString(b.training.date).getTime());

    const attendanceValues = this.getAttendanceValues();

    await this.clearTrainingsHistory(personTrainings, attendanceValues, dto.previousGroupAmountOfTrainingsInSubscription, 0);

    await user.$set("groups", user.groups.filter(group => group.id !== dto.groupId).map(group => group.id))

    return await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
      ]
    });
  }

  async changeGroup(dto: ChangeGroupDto) {
    const user = await this.usersRepository.findOne({ where: { id: dto.id } });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    const groups: Group[] = await lastValueFrom(this.groupsClient.send("get-groups-by-id", { groupsId: dto.groupsId }));

    if (groups.length < dto.groupsId.length) {
      return new BadRequestException("Такой группы не существует");
    }

    if (dto.previousGroupAmountOfTrainingsInSubscription &&
      dto.previousGroupAmountOfTrainingsInSubscription !== groups[0].amountOfTrainingsInSubscription) {
      const personTrainings: PersonTraining[] = await lastValueFrom(this.groupsClient.send(
        "get-all-person-trainings",
        { userId: user.id, trainingByDayId: null }
      ));

      personTrainings.sort((a, b) => this.getDateFromString(a.training.date).getTime() - this.getDateFromString(b.training.date).getTime());

      const attendanceValues = this.getAttendanceValues();

      await this.clearTrainingsHistory(personTrainings, attendanceValues, dto.previousGroupAmountOfTrainingsInSubscription, 0);
    }

    await user.$set("groups", dto.groupsId);

    return await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group, attributes: ["id", "name", "amountOfTrainingsInSubscription"] },
        { model: MedicalDocument },
        { model: Insurance },
      ]
    });
  }

  async changeRole(dto: ChangeRoleDto) {
    const user = await this.usersRepository.findOne({ where: { id: dto.id } });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    const role = await this.rolesRepository.findOne({ where: { id: dto.roleId } });

    if (!role) {
      return new BadRequestException("Такой роли не существует");
    }

    await this.usersRepository.update({ roleId: dto.roleId }, { where: { id: dto.id } });

    return await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
        { model: Role },
      ]
    });
  }

  async deleteRole(dto: DeleteRoleDto) {
    const user = await this.usersRepository.findOne({ where: { id: dto.id } });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.usersRepository.update({ roleId: null }, { where: { id: dto.id } });

    return await this.usersRepository.findOne({
      where: { id: dto.id },
      include: [
        { model: Group },
        { model: MedicalDocument },
        { model: Insurance },
        { model: Role },
      ]
    });
  }

  async getCurrentSubscriptionTrainingsHistory(dto: GetCurrentSubscriptionTrainingsHistoryDto) {
    return dto;
  }

  async markAttendance(dto: MarkAttendanceDto) {
    const users = await this.getUsersById({ usersId: dto.attendanceData.map(data => data.userId) });

    const attendanceValues = this.getAttendanceValues();

    for (let user of users) {

      const currentUserAttendanceData = dto.attendanceData.find(data => data.userId === user.id);
      const currentUserPersonTraining = dto.personTrainings.find(training => training.userId === user.id) || null;

      const isMarkChangedToAbsent = (currentUserAttendanceData.attendance === "НП" || currentUserPersonTraining?.attendance === "НП")
        && currentUserAttendanceData.attendance !== currentUserPersonTraining?.attendance;

      const difference = isMarkChangedToAbsent
        ? await this.countDifferenceIfAbsent(user, dto, attendanceValues)
        : await this.countDifferenceIfNotAbsent(user, dto, attendanceValues);

      if (difference === 0) continue;

      await user.increment(
        "trainingsLeft",
        { by: difference }
      )
    }

    return await this.getUsersByGroupId({ groupId: dto.groupId });
  }

  async clearHistoryOnGroupDelete(dto: ClearHistoryOnGroupDeleteDto) {
    const participants = await this.getUsersByGroupId({ groupId: dto.groupId });

    if (!Array.isArray(participants)) {
      return new BadRequestException("Произошла ошибка. Перезагрузите страницу и попробуйте снова");
    }

    for (let participant of participants) {
      await this.removeGroup({
        id: participant.id,
        groupId: dto.groupId,
        previousGroupAmountOfTrainingsInSubscription: dto.previousAmountOfTrainingsInSubscription
      });
    }

    return 1;
  }

  // async getAvatarByUserId(userId: number) {
  //   const medicalDocument = await this.medicalDocumentsRepository.findOne({ where: { userId } });
  //   return medicalDocument;
  // }

  async changeTrainingsLeft(dto: ChangeTrainingsLeftDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await user.increment("trainingsLeft", { by: dto.value });

    return await this.getUserById({ id: dto.id });
  }

  async changeName(dto: ChangeNameDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.usersRepository.update({ name: dto.name }, { where: { id: dto.id } });

    return await this.getUserById({ id: dto.id });
  }

  async changeParentName(dto: ChangeParentNameDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.usersRepository.update({ parentName: dto.parentName }, { where: { id: dto.id } });

    return await this.getUserById({ id: dto.id });
  }

  async changeVacationStaus(dto: ChangeVacationStatusDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.usersRepository.update({ isVacation: dto.status }, { where: { id: dto.id } });

    return await this.getUserById({ id: dto.id });
  }

  async uploadAvatar(dto: UploadAvatarDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.usersRepository.update({ photo: dto.photo }, { where: { id: dto.id } });

    return await this.getUserById({ id: dto.id });
  }

  async getMedicalDocumentByUserId(userId: number) {
    const medicalDocument = await this.medicalDocumentsRepository.findOne({ where: { userId } });
    return medicalDocument;
  }

  async uploadMedicalDocumentPhoto(dto: UploadMedicalDocumentPhotoDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.medicalDocumentsRepository.destroy({ where: { userId: dto.id } });

    const medicalDocument = await this.medicalDocumentsRepository.create({ photo: dto.photo });

    await user.$set("medicalDocument", medicalDocument.id);

    return await this.getUserById({ id: dto.id });
  }

  async setMedicalDocumentExpiration(dto: SetMedicalDocumentExpirationDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    const medicalDocumentFromDb = await this.medicalDocumentsRepository.findOne({ where: { userId: dto.id } });

    if (medicalDocumentFromDb) {
      await this.medicalDocumentsRepository.update({ expires: dto.expires }, { where: { userId: dto.id } });
      return await this.getUserById({ id: dto.id });
    }

    const medicalDocument = await this.medicalDocumentsRepository.create({ expires: dto.expires });

    await user.$set("medicalDocument", medicalDocument.id);

    return await this.getUserById({ id: dto.id });
  }

  async getInsuranceByUserId(userId: number) {
    const insurance = await this.insurancesRepository.findOne({ where: { userId } });
    return insurance;
  }

  async uploadInsurancePhoto(dto: UploadInsurancePhotoDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    await this.insurancesRepository.destroy({ where: { userId: dto.id } });

    const insurance = await this.insurancesRepository.create({ photo: dto.photo });

    await user.$set("insurance", insurance.id);

    return await this.getUserById({ id: dto.id });
  }

  async setInsuranceExpiration(dto: SetInsuranceExpirationDto) {
    const user = await this.getUserById({ id: dto.id });

    if (!user) {
      return new BadRequestException("Такого пользователя не существует");
    }

    const insuranceFromDb = await this.insurancesRepository.findOne({ where: { userId: dto.id } });

    if (insuranceFromDb) {
      await this.insurancesRepository.update({ expires: dto.expires }, { where: { userId: dto.id } });
      return await this.getUserById({ id: dto.id });
    }

    const insurance = await this.insurancesRepository.create({ expires: dto.expires });

    await user.$set("insurance", insurance.id);

    return await this.getUserById({ id: dto.id });
  }

  async getCoachRoles() {
    const coachRoles = await this.rolesRepository.findAll({ where: { [Op.or]: [{ value: "ADMIN" }, { value: "SUPER_ADMIN" }] } });
    return coachRoles;
  }

  async getUsersTrainingsSeparatedBySubscriptions(dto: GetUsersTrainingsSeparatedBySubscriptionsDto) {
    const thresholdDate = new Date(dto.thresholdDate);

    const users = await this.getUsersById({ usersId: dto.usersId }, [{ model: PersonTraining, include: [{ model: TrainingByDay }] }]);

    const attendanceValues = this.getAttendanceValues();

    const allDates = [];
    const normalizedHistory: INormalizedHistory = {};

    for (let user of users) {
      user.history.sort((a, b) => this.getDateFromString(a.training.date).getTime() - this.getDateFromString(b.training.date).getTime());

      const { allSubscriptions } = this.getAmountOfVisitedTrainings<IPersonTrainingWithIsAccountable>(
        user.history,
        attendanceValues,
        dto.amountOfTrainingsInSubscription,
        (obj) => ({
          id: obj.id,
          attendance: obj.attendance,
          isAccountable: obj.isAccountable,
          training: {
            id: obj.training.id,
            date: obj.training.date,
          }
        })
      );

      const historyForPeriod: IPersonTrainingWithIsAccountable[][] = [];

      for (let subscription of allSubscriptions.slice().reverse()) {
        const filteredSubscription = subscription.filter(training => {
          const trainingDate = this.getDateFromString(training.training.date).getTime();
          const isAboveThreshold = trainingDate >= thresholdDate.getTime();

          if (!allDates.includes(training.training.date) && isAboveThreshold) {
            allDates.push(training.training.date);
          }

          return isAboveThreshold;
        });

        if (filteredSubscription.length === 0) break;

        historyForPeriod.unshift(filteredSubscription);
      }

      normalizedHistory[user.id] = historyForPeriod;
    }

    allDates.sort((a, b) => this.getDateFromString(a).getTime() - this.getDateFromString(b).getTime());

    allDates.forEach(date => {
      for (let [key, history] of Object.entries(normalizedHistory)) {
        let isDateFound = false;

        for (let i = 0; i < history.length; i++) {
          const subscription = history[i];

          if (isDateFound) break;

          for (let j = 0; j < subscription.length; j++) {
            const attendanceItem = subscription[j]

            if (!attendanceItem) continue;

            if (date === attendanceItem.training.date) {
              isDateFound = true;
              break;
            }

            const attendanceItemDate = this.getDateFromString(attendanceItem.training.date);
            const dateItemDate = this.getDateFromString(date);

            if (attendanceItemDate.getTime() > dateItemDate.getTime()) {
              subscription.splice(j, 0, null);
              isDateFound = true;
              break;
            }

            if (i === history.length - 1 && j === subscription.length - 1) {
              const missingItems = new Array(allDates.length - history.reduce((acc, cur) => acc += cur.length, 0)).fill(null);
              subscription.push(...missingItems);
              isDateFound = true;
              break;
            }
          }
        }
      }
    })

    return { dates: allDates, history: normalizedHistory };
  }

  async countDifferenceIfAbsent(user: User, dto: MarkAttendanceDto, attendanceValues: IAttendanceValue[]) {

    const currentUserAttendanceData = dto.attendanceData.find(data => data.userId === user.id);
    const currentUserPersonTraining = dto.personTrainings.find(training => training.userId === user.id) || null;

    const personTrainings: PersonTraining[] = await lastValueFrom(this.groupsClient.send(
      "get-all-person-trainings",
      { userId: user.id, trainingByDayId: dto.personTrainings[0]?.trainingByDayId || null }
    ));

    personTrainings.push({ ...currentUserPersonTraining, training: { date: dto.date } } as PersonTraining);

    personTrainings.sort((a, b) => this.getDateFromString(a.training.date).getTime() - this.getDateFromString(b.training.date).getTime());

    const newPersonTrainings = personTrainings.map(personTraining => (
      Object.assign({}, {
        ...personTraining,
        attendance: personTraining.training.date === dto.date
          ? currentUserAttendanceData.attendance
          : personTraining.attendance
      })
    )) as PersonTraining[];

    await this.clearTrainingsHistory(newPersonTrainings, attendanceValues, dto.amountOfTrainingsInSubscription, 3)

    const { result: amountOfTrainingsBefore } = this.getAmountOfVisitedTrainings(personTrainings, attendanceValues, dto.amountOfTrainingsInSubscription, (obj) => obj.id);
    const { result: amountOfTrainingsAfter } = this.getAmountOfVisitedTrainings(newPersonTrainings, attendanceValues, dto.amountOfTrainingsInSubscription, (obj) => obj.id);

    return amountOfTrainingsAfter - amountOfTrainingsBefore;
  }

  async countDifferenceIfNotAbsent(user: User, dto: MarkAttendanceDto, attendanceValues: IAttendanceValue[]) {
    const currentUserAttendanceData = dto.attendanceData.find(data => data.userId === user.id) || null;
    const currentUserPersonTraining = dto.personTrainings.find(training => training.userId === user.id) || null;

    return (attendanceValues.find(value => value.attendance === currentUserAttendanceData?.attendance)?.value || 0)
      - (attendanceValues.find(value => value.attendance === currentUserPersonTraining?.attendance)?.value || 0)
  }

  getDateFromString(date: string) {
    const [day, month, year] = date.split(".");

    const dateObject = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    return dateObject;
  }

  getAmountOfVisitedTrainings<T = number>(
    personTrainings: PersonTraining[],
    attendanceValues: IAttendanceValue[],
    amountOfTrainingsInSubscription: number,
    adapterFn: (obj: IPersonTrainingWithIsAccountable) => T
  ) {
    let allowedToMiss = 2;
    let allSubscriptions: T[][] = [];
    let currentSubscriptionTrainings: T[] = [];

    const result = personTrainings.reduce((acc, cur) => {
      attendanceValues[1].value = -1;

      // currentSubscriptionTrainings.push(cur.id);
      currentSubscriptionTrainings.push(adapterFn({
        ...cur.dataValues,
        isAccountable: cur.attendance === "П"
          || (cur.attendance === "НП" && allowedToMiss <= 0)
      } as IPersonTrainingWithIsAccountable) as T);

      if (cur.attendance === "НП") {
        if (allowedToMiss > 0) {
          attendanceValues[1].value = 0;
          allowedToMiss -= 1;
        } else {
          attendanceValues[1].value = -1;
        }
      }

      acc += attendanceValues.find(value => value.attendance === cur.attendance)?.value || 0;

      // here was currentSubscriptionTrainings.push(adapterFn({...

      if (acc % amountOfTrainingsInSubscription === 0 && currentSubscriptionTrainings.length > 2) {
        allowedToMiss = 2;
        allSubscriptions.push(currentSubscriptionTrainings.slice());
        currentSubscriptionTrainings = [];
      }

      return acc;
    }, 0);

    if (currentSubscriptionTrainings.length > 0) {
      allSubscriptions.push(currentSubscriptionTrainings);
    }

    return { result, allSubscriptions };
  }

  async clearTrainingsHistory(
    personTrainings: PersonTraining[],
    attendanceValues: IAttendanceValue[],
    amountOfTrainingsInSubscription: number,
    monthToKeep: number
  ) {
    const { allSubscriptions } = this.getAmountOfVisitedTrainings(personTrainings, attendanceValues, amountOfTrainingsInSubscription, (obj) => obj.id);

    if (allSubscriptions.length > monthToKeep + 1) {
      await lastValueFrom(this.groupsClient.send(
        "delete-person-trainings",
        { personTrainingsId: allSubscriptions.reduce((acc, cur, index) => index + monthToKeep + 1 < allSubscriptions.length ? acc.concat(cur) : acc, []) }
      ))
    }

    return 1;
  }

  getAttendanceValues() {
    return [
      { attendance: "П" as const, value: -1 },
      { attendance: "НП" as const, value: -1 },
      { attendance: "УП" as const, value: 0 },
      { attendance: "Б" as const, value: 0 },
      { attendance: "ОТ" as const, value: 0 },
    ];
  }

  getUserFilterValues() {
    return [
      {
        id: 1,
        text: "Все",
        filterFn: (user: User) => true
      },
      {
        id: 2,
        text: "Тренеры",
        filterFn: (user: User) => user.type === "coach"
      },
      {
        id: 3,
        text: "Дети",
        filterFn: (user: User) => user.type === "user"
      },
      {
        id: 4,
        text: "Дети без группы",
        filterFn: (user: User) => user.type === "user" && (user.groups === null || user.groups.length === 0)
      },
      {
        id: 5,
        text: "С недейств. мед. справкой",
        filterFn: (user: User) => user.type === "user" && (user.medicalDocument?.expires && this.getDateFromString(user.medicalDocument.expires) < new Date() || !user.medicalDocument?.expires)
      },
      {
        id: 6,
        text: "С недейств. страховкой",
        filterFn: (user: User) => user.type === "user" && (user.insurance?.expires && this.getDateFromString(user.insurance.expires) < new Date() || !user.insurance?.expires)
      },
      {
        id: 7,
        text: "С недейств. абонементом",
        filterFn: (user: User) => user.type === "user" && user.trainingsLeft <= 0
      },
      {
        id: 8,
        text: "В отпуске",
        filterFn: (user: User) => user.type === "user" && user.isVacation
      },
    ];
  }

  // async getRoleByValue(value: string) {
  //   const role = await this.rolesRepository.findOne({ where: { value } });
  //   return role;
  // }

  // async createRole(dto: createRoleDto) {
  //   const user = await this.rolesRepository.create(dto);
  //   return user;
  // }
}
